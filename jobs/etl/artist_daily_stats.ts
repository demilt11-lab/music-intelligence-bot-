// jobs/etl/artist_daily_stats.ts
//
// Builds one ArtistDailyStats row per artist for a given date by rolling up:
//   - streams per platform        (TrackPlatformStatsDaily)
//   - playlist adds + reach       (PlaylistMembershipEvent + Playlist)
//   - genres by stream weight     (TrackTag/Tag, category='genre')
//   - radio plays                 (RadioAirplayFact)
//
// This is the root feeder for trajectory snapshots and artist scoring, so
// query failures are fatal (no silent empty results) — a missing day of
// data must surface in job logs, not masquerade as "no streams".
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';

type StreamRow = {
  artist_id: bigint;
  date: Date;
  total_streams: bigint;
  platform_streams: Record<string, number>;
};

type PlaylistRow = {
  artist_id: bigint;
  date: Date;
  playlist_count: number;
  editorial_playlist_count: number;
  indie_playlist_count: number;
  playlist_reach: bigint;
};

type GenreRow = {
  artist_id: bigint;
  date: Date;
  genres: string[];
  primary_code2: string | null;
};

type AirplayRow = {
  artist_id: bigint;
  date: Date;
  airplay_plays: bigint;
};

export async function buildArtistDailyStats(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${dateStr}`);
  }

  // Streams per artist per platform. Aggregates per platform first because
  // jsonb_object_agg cannot wrap another aggregate directly.
  const streamRows = await db.$queryRawUnsafe<StreamRow[]>(
    `
    WITH per_platform AS (
      SELECT
        ta."artistId"    AS artist_id,
        tpsd.date::date  AS date,
        tpsd.platform    AS platform,
        SUM(tpsd.streams) AS streams
      FROM track_platform_stats_daily tpsd
      JOIN track_artists ta ON ta."trackId" = tpsd."trackId"
      WHERE tpsd.date::date = $1::date
        AND tpsd.streams IS NOT NULL
      GROUP BY 1, 2, 3
    )
    SELECT
      artist_id,
      date,
      SUM(streams)::bigint AS total_streams,
      jsonb_object_agg(platform, streams) AS platform_streams
    FROM per_platform
    GROUP BY artist_id, date
    `,
    dateStr,
  );

  // Playlist adds: distinct playlists the artist's tracks were added to on
  // this date. "Editorial" approximated by Playlist.isOfficial.
  const playlistRows = await db.$queryRawUnsafe<PlaylistRow[]>(
    `
    WITH artist_playlists AS (
      SELECT DISTINCT
        ta."artistId"       AS artist_id,
        pme."eventDate"     AS date,
        pme."playlistId"    AS playlist_id,
        p."isOfficial"      AS is_official,
        p."followerCount"   AS follower_count
      FROM playlist_membership_events pme
      JOIN playlists p       ON p.id = pme."playlistId"
      JOIN track_artists ta  ON ta."trackId" = pme."trackId"
      WHERE pme."eventDate" = $1::date
        AND pme."eventType" = 'add'
    )
    SELECT
      artist_id,
      date,
      COUNT(*)::int                                   AS playlist_count,
      (COUNT(*) FILTER (WHERE is_official))::int      AS editorial_playlist_count,
      (COUNT(*) FILTER (WHERE NOT is_official))::int  AS indie_playlist_count,
      COALESCE(SUM(follower_count), 0)::bigint        AS playlist_reach
    FROM artist_playlists
    GROUP BY artist_id, date
    `,
    dateStr,
  );

  // Genres weighted by streams, from real tag associations.
  const genreRows = await db.$queryRawUnsafe<GenreRow[]>(
    `
    WITH artist_genres AS (
      SELECT
        ta."artistId"   AS artist_id,
        tpsd.date::date AS date,
        tg.name         AS genre,
        MAX(a.country)  AS code2,
        SUM(tpsd.streams) AS genre_streams
      FROM track_platform_stats_daily tpsd
      JOIN track_artists ta ON ta."trackId" = tpsd."trackId"
      JOIN artists a        ON a.id = ta."artistId"
      JOIN track_tags tt    ON tt."trackId" = tpsd."trackId"
      JOIN tags tg          ON tg.id = tt."tagId" AND tg.category = 'genre'
      WHERE tpsd.date::date = $1::date
        AND tpsd.streams IS NOT NULL
      GROUP BY 1, 2, 3
    )
    SELECT
      artist_id,
      date,
      ARRAY_AGG(genre ORDER BY genre_streams DESC) AS genres,
      MAX(code2) AS primary_code2
    FROM artist_genres
    GROUP BY artist_id, date
    `,
    dateStr,
  );

  // Radio spins per artist (one fact row = one play).
  const airplayRows = await db.$queryRawUnsafe<AirplayRow[]>(
    `
    SELECT
      ta."artistId"          AS artist_id,
      raf."playedAt"::date   AS date,
      COUNT(*)::bigint       AS airplay_plays
    FROM radio_airplay_facts raf
    JOIN track_artists ta ON ta."trackId" = raf."trackId"
    WHERE raf."playedAt"::date = $1::date
    GROUP BY 1, 2
    `,
    dateStr,
  );

  if (streamRows.length === 0) {
    console.warn(
      `[artist-daily-stats] No stream data for ${dateStr} — nothing to upsert. ` +
        `If ingestion ran today this indicates an upstream problem.`,
    );
    return { artists: 0 };
  }

  const key = (row: { artist_id: bigint; date: Date }) =>
    `${row.artist_id.toString()}-${row.date.toISOString().slice(0, 10)}`;

  const playlistMap = new Map(playlistRows.map((r) => [key(r), r]));
  const genreMap = new Map(genreRows.map((r) => [key(r), r]));
  const airplayMap = new Map(airplayRows.map((r) => [key(r), r.airplay_plays]));

  let written = 0;
  for (const row of streamRows) {
    const k = key(row);
    const playlist = playlistMap.get(k);
    const genreInfo = genreMap.get(k);
    const airplayPlays = airplayMap.get(k);

    const data = {
      totalStreams: row.total_streams,
      platformStreams: row.platform_streams,
      playlistCount: playlist?.playlist_count ?? null,
      editorialPlaylistCount: playlist?.editorial_playlist_count ?? null,
      indiePlaylistCount: playlist?.indie_playlist_count ?? null,
      playlistReach: playlist?.playlist_reach ?? null,
      genres: genreInfo?.genres ?? [],
      primaryCode2: genreInfo?.primary_code2 ?? null,
      airplayPlays: airplayPlays ?? null,
    };

    await db.artistDailyStats.upsert({
      where: { artistId_date: { artistId: row.artist_id, date: row.date } },
      update: data,
      create: { artistId: row.artist_id, date: row.date, ...data },
    });
    written++;
  }

  console.log(`[artist-daily-stats] Upserted ${written} artist rows for ${dateStr}`);
  return { artists: written };
}

if (require.main === module) {
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  runTrackedJob('etl:artist-daily', () => buildArtistDailyStats(dateArg))
    .then(({ artists }) => {
      console.log(`ArtistDailyStats built for ${dateArg} (${artists} artists)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
