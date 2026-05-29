/**
 * Database query layer for the Playlist Directory.
 *
 * Builds and executes a raw SQL query against the `playlists` table, joined to
 * the appropriate metrics view and optional tag / curator tables.
 */

import { db } from '@/lib/db';
import type { PlaylistDirectoryParams } from './types';

/** Maps API sort-column names to their underlying SQL column expressions. */
const SORT_COLUMN_MAP: Record<string, string> = {
  followers: 'm.followers',
  fdiff_week: 'm.follower_diff_week',
  fdiff_percent_week: 'm.follower_diff_percent_week',
  fdiff_month: 'm.follower_diff_month',
  fdiff_percent_month: 'm.follower_diff_percent_month',
  active_ratio: 'm.active_ratio',
  last_updated: 'p.last_updated',
  num_track: 'p.num_track',
  rank: 'm.rank',
  views: 'm.views',
  vdiff_week: 'm.view_diff_week',
  vdiff_percent_week: 'm.view_diff_percent_week',
  vdiff_month: 'm.view_diff_month',
  vdiff_percent_month: 'm.view_diff_percent_month',
};

/**
 * Returns the metrics table/view name to join for a given platform.
 *
 * Spotify and YouTube have their own dedicated latest-metrics views;
 * all other platforms use the generic `playlist_metrics_latest` view.
 */
function metricsTable(platform: string): string {
  switch (platform) {
    case 'spotify':
      return 'spotify_playlist_metrics_latest';
    case 'youtube':
      return 'youtube_playlist_metrics_latest';
    default:
      return 'playlist_metrics_latest';
  }
}

/**
 * Executes the playlist directory query with all applicable filters applied.
 *
 * @param params - Validated query parameters.
 * @returns Raw database rows and the total unfiltered count.
 */
export async function queryPlaylistDirectory(
  params: PlaylistDirectoryParams,
): Promise<{ data: any[]; total: number }> {
  const {
    platform,
    offset,
    limit,
    tagIds,
    sortColumn,
    sortOrderDesc,
    code2,
    editorial,
    topPlaylist,
    descriptionSearch,
    shortlistIds,
    curatorIds,
    excludedCuratorIds,
    indie,
    majorCurator,
    newMusicFriday,
  } = params;

  const metricsTbl = metricsTable(platform);
  const orderCol = SORT_COLUMN_MAP[sortColumn] ?? 'm.followers';
  const orderDir = sortOrderDesc ? 'DESC' : 'ASC';

  // We accumulate parameterised SQL fragments and their values.
  // Prisma $queryRaw uses tagged-template interpolation; for dynamic queries
  // we build a raw SQL string and use $queryRawUnsafe with positional params.
  const conditions: string[] = ['p.platform = $1'];
  const values: unknown[] = [platform];
  let paramIdx = 2;

  const addParam = (value: unknown): string => {
    values.push(value);
    return `$${paramIdx++}`;
  };

  if (code2 !== undefined) {
    conditions.push(`p.code2 = ${addParam(code2)}`);
  }

  if (editorial !== undefined) {
    conditions.push(`p.editorial = ${addParam(editorial)}`);
  }

  if (topPlaylist !== undefined) {
    conditions.push(`p.top_playlist = ${addParam(topPlaylist)}`);
  }

  if (descriptionSearch !== undefined) {
    conditions.push(`p.description ILIKE ${addParam(`%${descriptionSearch}%`)}`);
  }

  if (indie !== undefined) {
    conditions.push(`p.indie = ${addParam(indie)}`);
  }

  if (majorCurator !== undefined) {
    conditions.push(`p.major_curator = ${addParam(majorCurator)}`);
  }

  if (newMusicFriday !== undefined) {
    conditions.push(`p.new_music_friday = ${addParam(newMusicFriday)}`);
  }

  // Tag filter: playlist must have ALL requested tags (AND semantics)
  const tagSubqueries = tagIds.map((id) => {
    const p = addParam(id);
    return `EXISTS (
      SELECT 1 FROM playlist_tags pt
      WHERE pt.playlist_id = p.id AND pt.tag_id = ${p}
    )`;
  });
  conditions.push(...tagSubqueries);

  // Shortlist filter
  if (shortlistIds.length > 0) {
    const placeholders = shortlistIds.map((id) => addParam(id)).join(', ');
    conditions.push(`p.id IN (${placeholders})`);
  }

  // Curator include filter
  if (curatorIds.length > 0) {
    const placeholders = curatorIds.map((id) => addParam(id)).join(', ');
    conditions.push(
      `EXISTS (
        SELECT 1 FROM curator_playlists cp
        WHERE cp.playlist_id = p.id AND cp.curator_id IN (${placeholders})
      )`,
    );
  }

  // Curator exclude filter
  if (excludedCuratorIds.length > 0) {
    const placeholders = excludedCuratorIds.map((id) => addParam(id)).join(', ');
    conditions.push(
      `NOT EXISTS (
        SELECT 1 FROM curator_playlists cp
        WHERE cp.playlist_id = p.id AND cp.curator_id IN (${placeholders})
      )`,
    );
  }

  const whereClause = conditions.join(' AND ');

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM playlists p
    LEFT JOIN ${metricsTbl} m ON m.playlist_id = p.id
    WHERE ${whereClause}
  `;

  const dataSql = `
    SELECT
      p.id                          AS "playlistId",
      p.external_playlist_id        AS "externalPlaylistId",
      p.code2,
      p.name,
      p.image_url                   AS "imageUrl",
      p.personalized,
      p.last_updated                AS "lastUpdated",
      p.owner_name                  AS "ownerName",
      p.owner_id                    AS "ownerId",
      p.external_user_id            AS "externalUserId",
      p.editorial,
      p.top_playlist                AS "topPlaylist",
      p.num_track                   AS "numTrack",
      p.genre,
      m.followers,
      m.views,
      m.latest,
      m.follower_diff_week          AS "followerDiffWeek",
      m.follower_diff_percent_week  AS "followerDiffPercentWeek",
      m.follower_diff_month         AS "followerDiffMonth",
      m.follower_diff_percent_month AS "followerDiffPercentMonth",
      m.view_diff_week              AS "viewDiffWeek",
      m.view_diff_month             AS "viewDiffMonth",
      m.monthly_diff                AS "monthlyDiff",
      m.catalog,
      m.active_ratio                AS "activeRatio",
      m.rank,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
          FROM playlist_tags pt
          JOIN tags t ON t.id = pt.tag_id
          WHERE pt.playlist_id = p.id
        ),
        '[]'::json
      ) AS tags
    FROM playlists p
    LEFT JOIN ${metricsTbl} m ON m.playlist_id = p.id
    WHERE ${whereClause}
    ORDER BY ${orderCol} ${orderDir} NULLS LAST
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  // Push limit and offset as the last two parameters
  values.push(limit);
  values.push(offset);

  const [countResult, rows] = await Promise.all([
    db.$queryRawUnsafe<Array<{ total: number }>>(countSql, ...values.slice(0, values.length - 2)),
    db.$queryRawUnsafe<any[]>(dataSql, ...values),
  ]);

  const total = countResult[0]?.total ?? 0;

  return { data: rows, total };
}
