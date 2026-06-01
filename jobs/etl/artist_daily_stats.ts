// jobs/etl/artist_daily_stats.ts
import "dotenv/config";
import { db } from "@/lib/db";

/**
 * Build ArtistDailyStats for a single date (YYYY-MM-DD).
 * This is rule-based aggregation on existing track and playlist data.
 */
export async function buildArtistDailyStats(dateStr: string) {
  const dateParam = dateStr;

  // Aggregate streams per artist per day from track_platform_stats_daily
  const streamRows = await db.$queryRawUnsafe<{
    artist_id: bigint;
    date: Date;
    total_streams: bigint;
    platform_streams: any;
  }>(
    `
    SELECT
      ta.artist_id,
      tpsd.date::date AS date,
      SUM(tpsd.streams) AS total_streams,
      jsonb_object_agg(tpsd.platform, SUM(tpsd.streams)) AS platform_streams
    FROM track_platform_stats_daily tpsd
    JOIN tracks t ON t.id = tpsd.track_id
    JOIN track_artists ta ON ta.track_id = t.id
    WHERE tpsd.date::date = $1::date
    GROUP BY ta.artist_id, tpsd.date::date
    `,
    dateParam,
  );

  // Aggregate playlist membership per artist per day
  const playlistRows = await db.$queryRawUnsafe<{
    artist_id: bigint;
    date: Date;
    playlist_count: number;
    editorial_playlist_count: number;
    indie_playlist_count: number;
    playlist_reach: bigint;
  }>(
    `
    SELECT
      ta.artist_id,
      pme.added_at::date AS date,
      COUNT(DISTINCT pme.playlist_id) AS playlist_count,
      COUNT(DISTINCT CASE WHEN p.editorial THEN pme.playlist_id END) AS editorial_playlist_count,
      COUNT(DISTINCT CASE WHEN NOT p.editorial THEN pme.playlist_id END) AS indie_playlist_count,
      COALESCE(SUM(p.followers), 0) AS playlist_reach
    FROM playlist_membership_events pme
    JOIN playlists p ON p.id = pme.playlist_id
    JOIN tracks t ON t.id = pme.track_id
    JOIN track_artists ta ON ta.track_id = t.id
    WHERE pme.added_at::date = $1::date
    GROUP BY ta.artist_id, pme.added_at::date
    `,
    dateParam,
  );

  // Simple genre + region inference: weighted by streams from track_audio_features / tracks
  const genreRows = await db.$queryRawUnsafe<{
    artist_id: bigint;
    date: Date;
    genres: string[];
    primary_code2: string | null;
  }>(
    `
    WITH artist_genres AS (
      SELECT
        ta.artist_id,
        tpsd.date::date AS date,
        unnest(t.genres)::text AS genre,
        a.code2 AS code2,
        SUM(tpsd.streams) AS genre_streams
      FROM track_platform_stats_daily tpsd
      JOIN tracks t ON t.id = tpsd.track_id
      JOIN track_artists ta ON ta.track_id = t.id
      JOIN artists a ON a.id = ta.artist_id
      WHERE tpsd.date::date = $1::date
      GROUP BY ta.artist_id, tpsd.date::date, genre, a.code2
    )
    SELECT
      artist_id,
      date,
      ARRAY_AGG(genre ORDER BY genre_streams DESC) AS genres,
      MAX(code2) AS primary_code2
    FROM artist_genres
    GROUP BY artist_id, date
    `,
    dateParam,
  );

  // Index playlist + genre rows by artist+date for quick lookup
  const playlistKey = (row: { artist_id: bigint; date: Date }) =>
    `${row.artist_id.toString()}-${row.date.toISOString().slice(0, 10)}`;
  const playlistMap = new Map(
    playlistRows.map((r) => [playlistKey(r), r]),
  );
  const genreMap = new Map(
    genreRows.map((r) => [playlistKey(r), r]),
  );

  for (const row of streamRows) {
    const key = playlistKey(row);
    const playlist = playlistMap.get(key);
    const genreInfo = genreMap.get(key);

    await db.artistDailyStats.upsert({
      where: {
        artistId_date: {
          artistId: row.artist_id,
          date: row.date,
        },
      },
      update: {
        totalStreams: row.total_streams,
        platformStreams: row.platform_streams,
        playlistCount: playlist?.playlist_count ?? null,
        editorialPlaylistCount: playlist?.editorial_playlist_count ?? null,
        indiePlaylistCount: playlist?.indie_playlist_count ?? null,
        playlistReach: playlist?.playlist_reach ?? null,
        genres: genreInfo?.genres ?? [],
        primaryCode2: genreInfo?.primary_code2 ?? null,
      },
      create: {
        artistId: row.artist_id,
        date: row.date,
        totalStreams: row.total_streams,
        platformStreams: row.platform_streams,
        playlistCount: playlist?.playlist_count ?? null,
        editorialPlaylistCount: playlist?.editorial_playlist_count ?? null,
        indiePlaylistCount: playlist?.indie_playlist_count ?? null,
        playlistReach: playlist?.playlist_reach ?? null,
        genres: genreInfo?.genres ?? [],
        primaryCode2: genreInfo?.primary_code2 ?? null,
      },
    });
  }
}

if (require.main === module) {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error("Usage: ts-node jobs/etl/artist_daily_stats.ts YYYY-MM-DD");
    process.exit(1);
  }
  buildArtistDailyStats(dateArg)
    .then(() => {
      console.log("ArtistDailyStats built for", dateArg);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
    // TikTok / Shorts velocity per artist per day (example for TikTok global chart)
  const tiktokRows = await db.$queryRawUnsafe<{
    artist_id: bigint;
    date: Date;
    tiktok_score: number;
  }>(
    `
    SELECT
      ta.artist_id,
      tt.date::date AS date,
      AVG(tt.rank_score) AS tiktok_score
    FROM tiktok_track_chart_global_daily tt
    JOIN tracks t ON t.id = tt.track_id
    JOIN track_artists ta ON ta.track_id = t.id
    WHERE tt.date::date = $1::date
    GROUP BY ta.artist_id, tt.date::date
    `,
    dateParam,
  );

  const tiktokMap = new Map(
    tiktokRows.map((r) => [
      playlistKey(r),
      r.tiktok_score,
    ]),
  );

  // Airplay per artist per day
  const airplayRows = await db.$queryRawUnsafe<{
    artist_id: bigint;
    date: Date;
    airplay_plays: bigint;
  }>(
    `
    SELECT
      ra.artist_id,
      ra.date::date AS date,
      SUM(ra.plays) AS airplay_plays
    FROM radio_airplay_facts ra
    WHERE ra.date::date = $1::date
    GROUP BY ra.artist_id, ra.date::date
    `,
    dateParam,
  );

  const airplayMap = new Map(
    airplayRows.map((r) => [
      playlistKey(r),
      r.airplay_plays,
    ]),
  );
      const tiktokScore = tiktokMap.get(key);
    const airplayPlays = airplayMap.get(key);

    await db.artistDailyStats.upsert({
      where: { artistId_date: { artistId: row.artist_id, date: row.date } },
      update: {
        // ...
        airplayPlays: airplayPlays ?? null,
        // store chartCountries / airplayMarkets in later iterations if you want
      },
      create: {
        artistId: row.artist_id,
        date: row.date,
        totalStreams: row.total_streams,
        platformStreams: row.platform_streams,
        playlistCount: playlist?.playlist_count ?? null,
        editorialPlaylistCount: playlist?.editorial_playlist_count ?? null,
        indiePlaylistCount: playlist?.indie_playlist_count ?? null,
        playlistReach: playlist?.playlist_reach ?? null,
        genres: genreInfo?.genres ?? [],
        primaryCode2: genreInfo?.primary_code2 ?? null,
        airplayPlays: airplayPlays ?? null,
      },
    });
}
