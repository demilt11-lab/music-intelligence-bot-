// jobs/etl/artist_trajectory_snapshots.ts
import "dotenv/config";
import { db } from "@/lib/db";

type TrackTrendPred = {
  trackId: number;
  genre: string | null;
  code2: string | null;
  probViral: number;
  probTrending: number;
  probPopular: number;
};

function inferBreakoutRegionAndGenre(
  predictions: TrackTrendPred[],
) {
  // Aggregate probabilities by genre and region
  const genreScores = new Map<string, number>();
  const regionScores = new Map<string, number>();

  for (const p of predictions) {
    const viralWeight = p.probViral ?? 0;
    const trendingWeight = p.probTrending ?? 0;
    const popularWeight = p.probPopular ?? 0;
    const totalWeight =
      viralWeight * 1.5 +
      trendingWeight * 1.0 +
      popularWeight * 0.5;

    if (p.genre) {
      genreScores.set(
        p.genre,
        (genreScores.get(p.genre) ?? 0) + totalWeight,
      );
    }
    if (p.code2) {
      regionScores.set(
        p.code2,
        (regionScores.get(p.code2) ?? 0) + totalWeight,
      );
    }
  }

  let primaryGenre: string | null = null;
  let primaryCode2: string | null = null;
  let maxGenreScore = 0;
  let maxRegionScore = 0;

  for (const [g, score] of genreScores.entries()) {
    if (score > maxGenreScore) {
      maxGenreScore = score;
      primaryGenre = g;
    }
  }

  for (const [c, score] of regionScores.entries()) {
    if (score > maxRegionScore) {
      maxRegionScore = score;
      primaryCode2 = c;
    }
  }

  const breakoutRegions = Array.from(
    regionScores.entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code2, score]) => ({
      code2,
      score,
    }));

  const breakoutGenres = Array.from(
    genreScores.entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, score]) => ({
      genre,
      score,
    }));

  return {
    primaryGenre,
    primaryCode2,
    breakoutRegions,
    breakoutGenres,
  };
}

type DailyRow = {
  artistId: bigint;
  date: Date;
  totalStreams: bigint;
  playlistCount: number | null;
  totalFollowers: bigint | null;
};

function toKey(artistId: bigint, date: Date) {
  return `${artistId.toString()}-${date.toISOString().slice(0, 10)}`;
}

function rollingSum(values: number[], windowSize: number): number[] {
  const out: number[] = [];
  let sum = 0;
  const q: number[] = [];
  for (const v of values) {
    sum += v;
    q.push(v);
    if (q.length > windowSize) {
      sum -= q.shift()!;
    }
    out.push(sum);
  }
  return out;
}

function pctDelta(curr: number, prev: number | null): number {
  if (!prev || prev === 0) return 0;
  return (curr - prev) / prev;
}

/**
 * Basic rule-based classification:
 * - ABOUT_TO_BREAK: streams28dDelta > 1.0 and playlistsDelta28d > 0.5 and followersDelta28d > 0.2
 * - GROWING: streams28dDelta between 0.2 and 1.0
 * - DECLINING: streams28dDelta < -0.2 and playlistsDelta28d < -0.1
 * - STABLE: else
 */
function classifyStatus(args: {
  streams28dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
}) {
  const { streams28dDelta, playlistsDelta28d, followersDelta28d } = args;

  if (
    streams28dDelta > 1.0 &&
    playlistsDelta28d > 0.5 &&
    followersDelta28d > 0.2
  ) {
    return {
      status: "ABOUT_TO_BREAK",
      statusScore: 0.9,
      breakProbability: 0.85,
    };
  }

  if (streams28dDelta > 0.2) {
    return {
      status: "GROWING",
      statusScore: 0.7,
      breakProbability:
        0.4 + Math.min(streams28dDelta, 1.0) * 0.3,
    };
  }

  if (streams28dDelta < -0.2 && playlistsDelta28d < -0.1) {
    return {
      status: "DECLINING",
      statusScore: 0.7,
      breakProbability: 0.1,
    };
  }

  return {
    status: "STABLE",
    statusScore: 0.5,
    breakProbability: 0.2,
  };
}

export async function buildArtistTrajectorySnapshots(dateStr: string) {
  const untilDate = new Date(dateStr);

  // Pull last 120 days of ArtistDailyStats
  const rows = await db.artistDailyStats.findMany({
    where: {
      date: {
        lte: untilDate,
      },
    },
    orderBy: [{ artistId: "asc" }, { date: "asc" }],
  });

  // Group by artist
  const byArtist = new Map<bigint, DailyRow[]>();
  for (const r of rows) {
    const list = byArtist.get(r.artistId) ?? [];
    list.push({
      artistId: r.artistId,
      date: r.date,
      totalStreams: r.totalStreams,
      playlistCount: r.playlistCount ?? 0,
      totalFollowers: r.totalFollowers ?? null,
    });
    byArtist.set(r.artistId, list);
  }

  for (const [artistId, history] of byArtist.entries()) {
    if (!history.length) continue;

    const streams = history.map((h) =>
      Number(h.totalStreams),
    );
    const playlists = history.map(
      (h) => (h.playlistCount ?? 0) as number,
    );
    const followers = history.map((h) =>
      h.totalFollowers ? Number(h.totalFollowers) : 0,
    );
  for (const [artistId, history] of byArtist.entries()) {
    if (!history.length) continue;

    // ... your existing rolling sums + deltas ...

    // Core classification from growth metrics
    const {
      status,
      statusScore,
      breakProbability,
    } = classifyStatus({
      streams28dDelta,
      playlistsDelta28d,
      followersDelta28d,
    });

    // Get recent tracks for this artist
    const recentTracks = await db.track.findMany({
      where: {
        trackArtists: {
          some: { artistId },
        },
      },
      orderBy: {
        releaseDate: "desc",
      },
      take: 10, // last N releases
    });

    const trackIds = recentTracks.map((t) => t.id);
    let breakoutRegionsJson: any = null;
    let breakoutGenresJson: any = null;
    let primaryGenre: string | null = null;
    let primaryCode2: string | null = null;

    if (trackIds.length > 0) {
      const preds =
        await db.trackTrendPrediction.findMany({
          where: {
            trackId: { in: trackIds },
          },
        });

      const breakout = inferBreakoutRegionAndGenre(
        preds.map((p) => ({
          trackId: p.trackId,
          genre: p.genre,
          code2: p.code2,
          probViral: p.probViral,
          probTrending: p.probTrending,
          probPopular: p.probPopular,
        })),
      );

      primaryGenre = breakout.primaryGenre;
      primaryCode2 = breakout.primaryCode2;
      breakoutRegionsJson = {
        regions: breakout.breakoutRegions,
        genres: breakout.breakoutGenres,
      };
    }

    // Fallback to latestDaily if ML predictions absent
    const latestDaily =
      await db.artistDailyStats.findFirst({
        where: {
          artistId,
          date: latest.date,
        },
      });

    if (!primaryGenre) {
      primaryGenre =
        latestDaily?.genres?.[0] ?? null;
    }
    if (!primaryCode2) {
      primaryCode2 =
        latestDaily?.primaryCode2 ?? null;
    }

    await db.artistTrajectorySnapshot.create({
      data: {
        artistId,
        date: latest.date,
        streams7d,
        streams28d,
        streams90d,
        streams7dDelta,
        streams28dDelta,
        streams90dDelta,
        listeners28d: null,
        listenersDelta28d: null,
        followersDelta28d,
        playlistsDelta28d,
        editorialAdds28d: null,
        removals28d: null,
        tiktokVelocityScore: null,
        chartVelocityScore: null,
        airplayVelocityScore: null,
        primaryGenre,
        primaryCode2,
        breakoutCities: breakoutRegionsJson,
        status,
        statusScore,
        breakProbability,
      },
    });
  }
    const streams7dSeries = rollingSum(streams, 7);
    const streams28dSeries = rollingSum(streams, 28);
    const streams90dSeries = rollingSum(streams, 90);

    const latestIdx = history.length - 1;
    const latest = history[latestIdx];

    const streams7d = streams7dSeries[latestIdx] ?? 0;
    const streams28d = streams28dSeries[latestIdx] ?? 0;
    const streams90d = streams90dSeries[latestIdx] ?? 0;

    const prev7d = streams7dSeries[latestIdx - 1] ?? null;
    const prev28d = streams28dSeries[latestIdx - 1] ?? null;
    const prev90d = streams90dSeries[latestIdx - 1] ?? null;

    const streams7dDelta = pctDelta(streams7d, prev7d);
    const streams28dDelta = pctDelta(streams28d, prev28d);
    const streams90dDelta = pctDelta(streams90d, prev90d);

    const latestPlaylists = playlists[latestIdx] ?? 0;
    const prevPlaylists = playlists[latestIdx - 28] ?? playlists[0];
    const playlistsDelta28d = pctDelta(
      latestPlaylists,
      prevPlaylists,
    );

    const latestFollowers = followers[latestIdx] ?? 0;
    const prevFollowers = followers[latestIdx - 28] ?? followers[0];
    const followersDelta28d = pctDelta(
      latestFollowers,
      prevFollowers,
    );

    const { status, statusScore, breakProbability } =
      classifyStatus({
        streams28dDelta,
        playlistsDelta28d,
        followersDelta28d,
      });

    // naive primaryGenre / primaryCode2 from latest ArtistDailyStats row
    const latestDaily = await db.artistDailyStats.findFirst({
      where: { artistId, date: latest.date },
    });

    await db.artistTrajectorySnapshot.create({
      data: {
        artistId,
        date: latest.date,
        streams7d,
        streams28d,
        streams90d,
        streams7dDelta,
        streams28dDelta,
        streams90dDelta,
        listeners28d: null,
        listenersDelta28d: null,
        followersDelta28d,
        playlistsDelta28d,
        editorialAdds28d: null,
        removals28d: null,
        tiktokVelocityScore: null,
        chartVelocityScore: null,
        airplayVelocityScore: null,
        primaryGenre:
          latestDaily?.genres?.[0] ?? null,
        primaryCode2: latestDaily?.primaryCode2 ?? null,
        breakoutCities: null,
        status,
        statusScore,
        breakProbability,
      },
    });
  }
}

if (require.main === module) {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error(
      "Usage: ts-node jobs/etl/artist_trajectory_snapshots.ts YYYY-MM-DD",
    );
    process.exit(1);
  }
  buildArtistTrajectorySnapshots(dateArg)
    .then(() => {
      console.log(
        "ArtistTrajectorySnapshot built for",
        dateArg,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  function classifyStatus(args: {
  streams28dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
  tiktokVelocityScore?: number;
  airplayVelocityScore?: number;
}) {
  const {
    streams28dDelta,
    playlistsDelta28d,
    followersDelta28d,
    tiktokVelocityScore = 0,
    airplayVelocityScore = 0,
  } = args;

  const viralBoost =
    tiktokVelocityScore * 0.3 + airplayVelocityScore * 0.2;

  if (
    streams28dDelta + viralBoost > 1.0 &&
    playlistsDelta28d > 0.5 &&
    followersDelta28d > 0.2
  ) {
    return {
      status: "ABOUT_TO_BREAK",
      statusScore: 0.9 + viralBoost * 0.1,
      breakProbability: 0.8 + viralBoost * 0.1,
    };
  }

  if (streams28dDelta + viralBoost > 0.2) {
    return {
      status: "GROWING",
      statusScore:
        0.6 + Math.min(streams28dDelta + viralBoost, 1.0) * 0.2,
      breakProbability:
        0.4 + Math.min(streams28dDelta + viralBoost, 1.0) * 0.3,
    };
  }

  if (streams28dDelta < -0.2 && playlistsDelta28d < -0.1) {
    return {
      status: "DECLINING",
      statusScore: 0.7,
      breakProbability: 0.1,
    };
  }

  return {
    status: "STABLE",
    statusScore: 0.5,
    breakProbability: 0.2,
  };
}
  // After computing streams/playlist/follower deltas
const recentTracks = await db.track.findMany({
  where: {
    trackArtists: {
      some: { artistId },
    },
  },
  take: 10, // latest few tracks
  orderBy: { releaseDate: "desc" },
});

const predictions =
  await db.trackTrendPrediction.findMany({
    where: {
      trackId: {
        in: recentTracks.map((t) => t.id),
      },
    },
  });

let maxProbViral = 0;
let breakGenre: string | null = null;
let breakCode2: string | null = null;

for (const p of predictions) {
  if (p.probViral > maxProbViral) {
    maxProbViral = p.probViral;
    breakGenre = p.genre;
    breakCode2 = p.code2;
  }
}

// You can inject this into classifyStatus as an extra signal
// and store breakGenre/breakCode2 in snapshot
}
