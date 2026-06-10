// jobs/etl/artist_trajectory_snapshots.ts
//
// Builds one ArtistTrajectorySnapshot per artist for a reference date from
// ArtistDailyStats history. Deltas compare each rolling window against the
// equivalent window immediately before it (7d vs prior 7d, 28d vs prior 28d,
// 90d vs prior 90d) so the classification thresholds operate on real
// period-over-period growth, not a one-day shift.
//
// Re-running for the same date replaces that date's snapshots (idempotent).
import { db } from "@/lib/db";

const HISTORY_DAYS = 200; // 90d window + 90d baseline + slack
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TrackTrendPred = {
  trackId: number;
  genre: string | null;
  code2: string | null;
  probViral: number;
  probTrending: number;
  probPopular: number;
};

export type DailyRow = {
  artistId: bigint;
  date: Date;
  totalStreams: bigint;
  playlistCount: number | null;
  totalFollowers: bigint | null;
};

export function inferBreakoutRegionAndGenre(predictions: TrackTrendPred[]) {
  const genreScores = new Map<string, number>();
  const regionScores = new Map<string, number>();

  for (const p of predictions) {
    const totalWeight =
      (p.probViral ?? 0) * 1.5 +
      (p.probTrending ?? 0) * 1.0 +
      (p.probPopular ?? 0) * 0.5;

    if (p.genre) {
      genreScores.set(p.genre, (genreScores.get(p.genre) ?? 0) + totalWeight);
    }
    if (p.code2) {
      regionScores.set(p.code2, (regionScores.get(p.code2) ?? 0) + totalWeight);
    }
  }

  const top = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]);

  const genres = top(genreScores);
  const regions = top(regionScores);

  return {
    primaryGenre: genres[0]?.[0] ?? null,
    primaryCode2: regions[0]?.[0] ?? null,
    breakoutRegions: regions.slice(0, 5).map(([code2, score]) => ({ code2, score })),
    breakoutGenres: genres.slice(0, 5).map(([genre, score]) => ({ genre, score })),
  };
}

/** Sum of the last `windowSize` values ending at `endIdx` (inclusive). */
export function windowSum(values: number[], endIdx: number, windowSize: number): number {
  if (endIdx < 0) return 0;
  const start = Math.max(0, endIdx - windowSize + 1);
  let sum = 0;
  for (let i = start; i <= endIdx; i++) sum += values[i];
  return sum;
}

export function pctDelta(curr: number, prev: number | null): number {
  if (!prev || prev === 0) return 0;
  return (curr - prev) / prev;
}

export type WindowDeltas = {
  streams7d: number;
  streams28d: number;
  streams90d: number;
  streams7dDelta: number;
  streams28dDelta: number;
  streams90dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
};

const MIN_BASELINE_DAYS = 7;

/**
 * Window sums + period-over-period deltas at the latest index of each series.
 * Each delta compares the current window's DAILY RATE against the daily rate
 * of the window immediately preceding it, so a partially-populated baseline
 * (short history) cannot inflate growth. Baselines covering fewer than
 * MIN_BASELINE_DAYS days produce a delta of 0 (no claim) rather than a guess.
 */
export function computeWindowDeltas(
  streams: number[],
  playlists: number[],
  followers: number[],
): WindowDeltas {
  const latestIdx = streams.length - 1;

  const sumAt = (w: number, end: number) => windowSum(streams, end, w);

  // Rate-normalized delta: current window rate vs prior window rate.
  const rateDelta = (w: number): number => {
    const baselineEnd = latestIdx - w;
    if (baselineEnd < 0) return 0;
    const baselineStart = Math.max(0, baselineEnd - w + 1);
    const baselineDays = baselineEnd - baselineStart + 1;
    if (baselineDays < Math.min(w, MIN_BASELINE_DAYS)) return 0;

    const currentDays = Math.min(w, latestIdx + 1);
    const currentRate = sumAt(w, latestIdx) / currentDays;
    const baselineRate = windowSum(streams, baselineEnd, baselineDays) / baselineDays;
    return pctDelta(currentRate, baselineRate || null);
  };

  const streams7d = sumAt(7, latestIdx);
  const streams28d = sumAt(28, latestIdx);
  const streams90d = sumAt(90, latestIdx);

  const latestPlaylists = playlists[latestIdx] ?? 0;
  const prevPlaylists =
    latestIdx - 28 >= 0 ? playlists[latestIdx - 28] : null;

  const latestFollowers = followers[latestIdx] ?? 0;
  const prevFollowers =
    latestIdx - 28 >= 0 ? followers[latestIdx - 28] : null;

  return {
    streams7d,
    streams28d,
    streams90d,
    streams7dDelta: rateDelta(7),
    streams28dDelta: rateDelta(28),
    streams90dDelta: rateDelta(90),
    playlistsDelta28d: pctDelta(latestPlaylists, prevPlaylists),
    followersDelta28d: pctDelta(latestFollowers, prevFollowers),
  };
}

/**
 * Rule-based trajectory classification. `breakProbability` here is a
 * heuristic tier value, not a calibrated model output — the API/UI must
 * label it as such (see ArtistTrajectorySnapshot.spotifyBreakProb for the
 * model-backed probability when available).
 */
export function classifyStatus(args: {
  streams28dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
  tiktokVelocityScore?: number | null;
  airplayVelocityScore?: number | null;
}) {
  const {
    streams28dDelta,
    playlistsDelta28d,
    followersDelta28d,
    tiktokVelocityScore,
    airplayVelocityScore,
  } = args;

  const viralBoost =
    (tiktokVelocityScore ?? 0) * 0.3 + (airplayVelocityScore ?? 0) * 0.2;
  const momentum = streams28dDelta + viralBoost;

  if (momentum > 1.0 && playlistsDelta28d > 0.5 && followersDelta28d > 0.2) {
    return {
      status: "ABOUT_TO_BREAK",
      statusScore: Math.min(1, 0.9 + viralBoost * 0.1),
      breakProbability: Math.min(1, 0.8 + viralBoost * 0.1),
    };
  }

  if (momentum > 0.2) {
    return {
      status: "GROWING",
      statusScore: 0.6 + Math.min(momentum, 1.0) * 0.2,
      breakProbability: 0.4 + Math.min(momentum, 1.0) * 0.3,
    };
  }

  if (streams28dDelta < -0.2 && playlistsDelta28d < -0.1) {
    return { status: "DECLINING", statusScore: 0.7, breakProbability: 0.1 };
  }

  return { status: "STABLE", statusScore: 0.5, breakProbability: 0.2 };
}

export async function buildArtistTrajectorySnapshots(dateStr: string) {
  const untilDate = new Date(dateStr);
  if (Number.isNaN(untilDate.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  const sinceDate = new Date(untilDate.getTime() - HISTORY_DAYS * MS_PER_DAY);

  const rows = await db.artistDailyStats.findMany({
    where: { date: { gte: sinceDate, lte: untilDate } },
    orderBy: [{ artistId: "asc" }, { date: "asc" }],
  });

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

  let written = 0;
  let failed = 0;

  for (const [artistIdBig, history] of byArtist.entries()) {
    if (!history.length) continue;
    const artistId = Number(artistIdBig);

    try {
      const streams = history.map((h) => Number(h.totalStreams));
      const playlists = history.map((h) => h.playlistCount ?? 0);
      const followers = history.map((h) =>
        h.totalFollowers != null ? Number(h.totalFollowers) : 0,
      );

      const latest = history[history.length - 1];
      const deltas = computeWindowDeltas(streams, playlists, followers);

      const { status, statusScore, breakProbability } = classifyStatus({
        streams28dDelta: deltas.streams28dDelta,
        playlistsDelta28d: deltas.playlistsDelta28d,
        followersDelta28d: deltas.followersDelta28d,
      });

      // ML enrichment: trend predictions on the artist's recent releases
      // drive primary genre/region and the max viral probability signal.
      const recentTracks = await db.track.findMany({
        where: { trackArtists: { some: { artistId } } },
        orderBy: { releaseDate: "desc" },
        take: 10,
        select: { id: true },
      });

      let primaryGenre: string | null = null;
      let primaryCode2: string | null = null;
      let breakoutJson:
        | { regions: { code2: string; score: number }[]; genres: { genre: string; score: number }[] }
        | undefined;
      let maxTrackProbViral: number | null = null;

      if (recentTracks.length) {
        const preds = await db.trackTrendPrediction.findMany({
          where: { trackId: { in: recentTracks.map((t) => t.id) } },
        });

        if (preds.length) {
          const breakout = inferBreakoutRegionAndGenre(preds);
          primaryGenre = breakout.primaryGenre;
          primaryCode2 = breakout.primaryCode2;
          breakoutJson = {
            regions: breakout.breakoutRegions,
            genres: breakout.breakoutGenres,
          };
          maxTrackProbViral = preds.reduce(
            (max, p) => Math.max(max, p.probViral ?? 0),
            0,
          );
        }
      }

      if (!primaryGenre) primaryGenre = latest ? await firstGenre(artistIdBig, latest.date) : null;
      if (!primaryCode2) {
        const latestDaily = await db.artistDailyStats.findFirst({
          where: { artistId: artistIdBig, date: latest.date },
          select: { primaryCode2: true },
        });
        primaryCode2 = latestDaily?.primaryCode2 ?? null;
      }

      // Idempotent write: one snapshot per (artistId, date).
      const snapshotData = {
        streams7d: BigInt(Math.round(deltas.streams7d)),
        streams28d: BigInt(Math.round(deltas.streams28d)),
        streams90d: BigInt(Math.round(deltas.streams90d)),
        streams7dDelta: deltas.streams7dDelta,
        streams28dDelta: deltas.streams28dDelta,
        streams90dDelta: deltas.streams90dDelta,
        listeners28d: null,
        listenersDelta28d: null,
        followersDelta28d: deltas.followersDelta28d,
        playlistsDelta28d: deltas.playlistsDelta28d,
        editorialAdds28d: null,
        removals28d: null,
        tiktokVelocityScore: null,
        chartVelocityScore: null,
        airplayVelocityScore: null,
        primaryGenre,
        primaryCode2,
        breakoutCities: breakoutJson,
        status,
        statusScore,
        breakProbability,
        maxTrackProbViral,
      };

      await db.artistTrajectorySnapshot.upsert({
        where: { artistId_date: { artistId, date: latest.date } },
        update: snapshotData,
        create: { artistId, date: latest.date, ...snapshotData },
      });

      written++;
    } catch (err) {
      failed++;
      console.error(
        `[artist-trajectory] artist=${artistIdBig} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[artist-trajectory] date=${dateStr} artists=${byArtist.size} written=${written} failed=${failed}`,
  );
  return { artists: byArtist.size, written, failed };
}

async function firstGenre(artistId: bigint, date: Date): Promise<string | null> {
  const daily = await db.artistDailyStats.findFirst({
    where: { artistId, date },
    select: { genres: true },
  });
  return daily?.genres?.[0] ?? null;
}

if (require.main === module) {
  const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  buildArtistTrajectorySnapshots(dateArg)
    .then(({ written, failed }) => {
      console.log(`ArtistTrajectorySnapshot built for ${dateArg} (written=${written}, failed=${failed})`);
      process.exit(failed > 0 && written === 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
