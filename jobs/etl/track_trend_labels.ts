// jobs/etl/track_trend_labels.ts
import "dotenv/config";
import { db } from "@/lib/db";

type TrackAggKey = {
  trackId: number;
  genre: string | null;
  code2: string | null;
};

function pctDelta(curr: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return (curr - prev) / prev;
}

function classifyLabel(args: {
  streamsGrowth7d: number;
  ugcViewsGrowth7d: number;
  playlistStreams7d: number;
  viralScore: number;
}): string {
  const {
    streamsGrowth7d,
    ugcViewsGrowth7d,
    playlistStreams7d,
    viralScore,
  } = args;

  // VIRAL: very high short-term growth, high UGC/viralScore
  if (
    streamsGrowth7d > 1.0 &&
    ugcViewsGrowth7d > 1.0 &&
    (viralScore > 0.7 || playlistStreams7d > 50_000)
  ) {
    return "VIRAL";
  }

  // TRENDING: moderate growth with some UGC or playlists
  if (
    streamsGrowth7d > 0.3 &&
    (ugcViewsGrowth7d > 0.2 ||
      playlistStreams7d > 10_000 ||
      viralScore > 0.4)
  ) {
    return "TRENDING";
  }

  // POPULAR: large base volume, even if growth is modest
  if (playlistStreams7d > 200_000 || viralScore > 0.8) {
    return "POPULAR";
  }

  return "NONE";
}

export async function buildTrackTrendLabels(dateStr: string) {
  const snapshotDate = new Date(dateStr);

  // 1) Streams by track + genre + country over last 14 days
  // We approximate genre/country via GenrePlaylistMetrics and TrackPlatformStatsDaily.
  const streamRows = await db.$queryRawUnsafe<{
    track_id: number;
    genre: string | null;
    code2: string | null;
    streams7d: number;
    prev_streams7d: number;
  }>(
    `
    WITH track_streams AS (
      SELECT
        tpsd.track_id,
        -- derive genre from tags or genre playlist metrics if available
        COALESCE(gpm.genre, 'unknown') AS genre,
        COALESCE(gpm.country, 'GLOBAL') AS code2,
        CASE
          WHEN tpsd.date BETWEEN $1::date - INTERVAL '6 days' AND $1::date
          THEN tpsd.streams::bigint
          ELSE 0::bigint
        END AS streams7d,
        CASE
          WHEN tpsd.date BETWEEN $1::date - INTERVAL '13 days' AND $1::date - INTERVAL '7 days'
          THEN tpsd.streams::bigint
          ELSE 0::bigint
        END AS prev_streams7d
      FROM track_platform_stats_daily tpsd
      JOIN tracks t ON t.id = tpsd.track_id
      LEFT JOIN genre_playlist_metrics gpm
        ON gpm.date = tpsd.date
       AND gpm.country = tpsd.platform -- approximate country by platform/country mapping
       AND gpm.genre = (
         SELECT tt2.name
         FROM track_tags tt
         JOIN tags tt2 ON tt2.id = tt.tag_id
         WHERE tt.track_id = tpsd.track_id
         LIMIT 1
       )
      WHERE tpsd.date BETWEEN $1::date - INTERVAL '13 days' AND $1::date
    )
    SELECT
      track_id,
      genre,
      code2,
      SUM(streams7d) AS streams7d,
      SUM(prev_streams7d) AS prev_streams7d
    FROM track_streams
    GROUP BY track_id, genre, code2
    `,
    dateStr,
  );

  // 2) UGC metrics (TikTok/Shorts) by track + country for same window
  const ugcRows = await db.$queryRawUnsafe<{
    track_id: number;
    code2: string;
    views7d: number;
    prev_views7d: number;
  }>(
    `
    SELECT
      utm.track_id,
      utm.code2,
      SUM(
        CASE
          WHEN utm.date BETWEEN $1::date - INTERVAL '6 days' AND $1::date
          THEN utm.views7d
          ELSE 0
        END
      ) AS views7d,
      SUM(
        CASE
          WHEN utm.date BETWEEN $1::date - INTERVAL '13 days' AND $1::date - INTERVAL '7 days'
          THEN utm.views7d
          ELSE 0
        END
      ) AS prev_views7d
    FROM ugc_track_metrics utm
    WHERE utm.date BETWEEN $1::date - INTERVAL '13 days' AND $1::date
    GROUP BY utm.track_id, utm.code2
    `,
    dateStr,
  );

  // 3) Playlist streams per genre/country in last 7d to gauge base volume
  const playlistRows = await db.$queryRawUnsafe<{
    genre: string;
    country: string;
    date: Date;
    playlist_type: string;
    streams7d: number;
  }>(
    `
    SELECT
      genre,
      country,
      MAX(date) AS date,
      playlist_type,
      streams7d
    FROM genre_playlist_metrics
    WHERE date = $1::date
    `,
    dateStr,
  );

  // 4) Existing TalentScoutScore as viralScore per track+code2
  const talentRows = await db.talentScoutScore.findMany({
    where: {
      date: snapshotDate,
    },
  });

  // Index UGC rows by (trackId, code2), playlist by (genre, country),
  // talent by (trackId, code2)
  const ugcMap = new Map<string, { views7d: number; prev_views7d: number }>();
  for (const u of ugcRows) {
    const key = `${u.track_id}-${u.code2}`;
    ugcMap.set(key, {
      views7d: u.views7d,
      prev_views7d: u.prev_views7d,
    });
  }

  const playlistMap = new Map<string, number>();
  for (const p of playlistRows) {
    const key = `${p.genre}-${p.country}`;
    playlistMap.set(key, p.streams7d);
  }

  const talentMap = new Map<string, number>();
  for (const t of talentRows) {
    const key = `${t.trackId}-${t.code2}`;
    talentMap.set(key, t.viralScore);
  }

  for (const s of streamRows) {
    const keyUgc = `${s.track_id}-${s.code2 ?? "GLOBAL"}`;
    const ugc = ugcMap.get(keyUgc);
    const ugcViews7d = ugc?.views7d ?? 0;
    const prevUgcViews7d = ugc?.prev_views7d ?? 0;

    const streams7d = Number(s.streams7d);
    const prevStreams7d = Number(s.prev_streams7d);

    const streamsGrowth7d = pctDelta(
      streams7d,
      prevStreams7d,
    );
    const ugcViewsGrowth7d = pctDelta(
      ugcViews7d,
      prevUgcViews7d,
    );

    const playlistKey = `${s.genre ?? "unknown"}-${s.code2 ?? "GLOBAL"}`;
    const playlistStreams7d =
      playlistMap.get(playlistKey) ?? 0;

    const talentKey = `${s.track_id}-${s.code2 ?? "GLOBAL"}`;
    const viralScore = talentMap.get(talentKey) ?? 0;

    const label = classifyLabel({
      streamsGrowth7d,
      ugcViewsGrowth7d,
      playlistStreams7d,
      viralScore,
    });

    await db.trackTrendLabel.upsert({
      where: {
        trackId_genre_code2: {
          trackId: s.track_id,
          genre: s.genre,
          code2: s.code2,
        },
      },
      update: {
        label,
        firstSeenAt:
          prevStreams7d === 0 && label !== "NONE"
            ? snapshotDate
            : undefined,
        lastSeenAt: snapshotDate,
      },
      create: {
        trackId: s.track_id,
        genre: s.genre,
        code2: s.code2,
        label,
        firstSeenAt: snapshotDate,
        lastSeenAt: snapshotDate,
      },
    });
  }
}

if (require.main === module) {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error(
      "Usage: ts-node jobs/etl/track_trend_labels.ts YYYY-MM-DD",
    );
    process.exit(1);
  }
  buildTrackTrendLabels(dateArg)
    .then(() => {
      console.log(
        "TrackTrendLabels built for",
        dateArg,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
