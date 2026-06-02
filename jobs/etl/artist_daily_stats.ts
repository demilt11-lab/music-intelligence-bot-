// jobs/etl/artist_daily_stats.ts
import { db } from "@/lib/db";

export async function buildArtistDailyStats(dateStr: string) {
  const dateParam = dateStr;

  const streamRows = await db.$queryRawUnsafe<Array<{
    artist_id: bigint;
    date: Date;
    total_streams: bigint;
    platform_streams: any;
  }>>(
    `
    SELECT
      ta."artistId" AS artist_id,
      tpsd.date::date AS date,
      SUM(tpsd.streams) AS total_streams,
      jsonb_object_agg(tpsd.platform, SUM(tpsd.streams)) AS platform_streams
    FROM track_platform_stats_daily tpsd
    JOIN tracks t ON t.id = tpsd."trackId"
    JOIN track_artists ta ON ta."trackId" = t.id
    WHERE tpsd.date::date = $1::date
      AND tpsd.streams IS NOT NULL
    GROUP BY ta."artistId", tpsd.date::date
    `,
    dateParam,
  ).catch(() => [] as any[]);

  const playlistRows = await db.$queryRawUnsafe<Array<{
    artist_id: bigint;
    date: Date;
    playlist_count: number;
    editorial_playlist_count: number;
    indie_playlist_count: number;
    playlist_reach: bigint;
  }>>(
    `
    SELECT
      ta."artistId" AS artist_id,
      pme."addedAt"::date AS date,
      COUNT(DISTINCT pme."playlistId") AS playlist_count,
      COUNT(DISTINCT CASE WHEN p.editorial THEN pme."playlistId" END) AS editorial_playlist_count,
      COUNT(DISTINCT CASE WHEN NOT p.editorial THEN pme."playlistId" END) AS indie_playlist_count,
      COALESCE(SUM(p.followers), 0) AS playlist_reach
    FROM playlist_membership_events pme
    JOIN playlists p ON p.id = pme."playlistId"
    JOIN tracks t ON t.id = pme."trackId"
    JOIN track_artists ta ON ta."trackId" = t.id
    WHERE pme."addedAt"::date = $1::date
    GROUP BY ta."artistId", pme."addedAt"::date
    `,
    dateParam,
  ).catch(() => [] as any[]);

  const genreRows = await db.$queryRawUnsafe<Array<{
    artist_id: bigint;
    date: Date;
    genres: string[];
    primary_code2: string | null;
  }>>(
    `
    WITH artist_genres AS (
      SELECT
        ta."artistId" AS artist_id,
        tpsd.date::date AS date,
        unnest(t.genres)::text AS genre,
        a.code2 AS code2,
        SUM(tpsd.streams) AS genre_streams
      FROM track_platform_stats_daily tpsd
      JOIN tracks t ON t.id = tpsd."trackId"
      JOIN track_artists ta ON ta."trackId" = t.id
      JOIN artists a ON a.id = ta."artistId"
      WHERE tpsd.date::date = $1::date
        AND tpsd.streams IS NOT NULL
      GROUP BY ta."artistId", tpsd.date::date, genre, a.code2
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
  ).catch(() => [] as any[]);

  const airplayRows = await db.$queryRawUnsafe<Array<{
    artist_id: bigint;
    date: Date;
    airplay_plays: bigint;
  }>>(
    `
    SELECT
      ra."artistId" AS artist_id,
      ra.date::date AS date,
      SUM(ra.plays) AS airplay_plays
    FROM radio_airplay_facts ra
    WHERE ra.date::date = $1::date
    GROUP BY ra."artistId", ra.date::date
    `,
    dateParam,
  ).catch(() => [] as any[]);

  if (streamRows.length === 0) {
    console.log("[artist-daily-stats] No stream data for " + dateStr + " — skipping upserts");
    return;
  }

  const playlistKey = (row: { artist_id: bigint; date: Date }) =>
    row.artist_id.toString() + "-" + row.date.toISOString().slice(0, 10);

  const playlistMap = new Map(playlistRows.map((r) => [playlistKey(r), r]));
  const genreMap = new Map(genreRows.map((r) => [playlistKey(r), r]));
  const airplayMap = new Map(airplayRows.map((r) => [playlistKey(r), r.airplay_plays]));

  for (const row of streamRows) {
    const key = playlistKey(row);
    const playlist = playlistMap.get(key);
    const genreInfo = genreMap.get(key);
    const airplayPlays = airplayMap.get(key);

    await db.artistDailyStats.upsert({
      where: { artistId_date: { artistId: row.artist_id, date: row.date } },
      update: {
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

  console.log("[artist-daily-stats] Upserted " + streamRows.length + " artist rows for " + dateStr);
}

if (require.main === module) {
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  buildArtistDailyStats(dateArg)
    .then(() => { console.log("ArtistDailyStats built for", dateArg); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
