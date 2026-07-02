/**
 * Database query layer for the Playlist Directory.
 *
 * Builds and executes a raw SQL query against the `playlists` table, joined to
 * the platform's latest-metrics table and optional tag / curator tables.
 *
 * NOTE ON COLUMN NAMES: Prisma creates camelCase, quoted identifiers (e.g.
 * "followerCount") — every column reference below must match
 * prisma/schema.prisma, not an idealized snake_case schema. Sort keys that
 * have no schema backing yet (follower diffs, active_ratio, rank) fall back
 * to the followers expression so the API contract stays stable instead of
 * erroring.
 */

import { db } from '@/lib/db';
import type { PlaylistDirectoryParams } from './types';

/** Per-platform SQL expressions for metrics that live in different tables. */
interface MetricsExprs {
  table: string;
  followers: string;
  views: string;
  trackCount: string;
}

/**
 * Returns the metrics table and column expressions for a platform.
 *
 * Spotify and YouTube have dedicated latest-metrics tables with their own
 * column names; all other platforms use the generic `playlist_metrics_latest`.
 */
function metricsExprs(platform: string): MetricsExprs {
  switch (platform) {
    case 'spotify':
      return {
        table: 'spotify_playlist_metrics_latest',
        followers: 'COALESCE(m."followers", p."followerCount")',
        views: 'NULL',
        trackCount: 'COALESCE(m."trackCount", p."trackCount")',
      };
    case 'youtube':
      return {
        table: 'youtube_playlist_metrics_latest',
        followers: 'COALESCE(m."subscribers", p."followerCount")',
        views: 'm."totalViews"',
        trackCount: 'COALESCE(m."videoCount", p."trackCount")',
      };
    default:
      return {
        table: 'playlist_metrics_latest',
        followers: 'COALESCE(m."followerCount", p."followerCount")',
        views: 'NULL',
        trackCount: 'COALESCE(m."trackCount", p."trackCount")',
      };
  }
}

/** Maps API sort-column names to SQL expressions built from real columns. */
function sortExpression(sortColumn: string, m: MetricsExprs): string {
  switch (sortColumn) {
    case 'last_updated':
      return 'p."updatedAt"';
    case 'num_track':
      return m.trackCount;
    case 'views':
    case 'vdiff_week':
    case 'vdiff_percent_week':
    case 'vdiff_month':
    case 'vdiff_percent_month':
      return m.views === 'NULL' ? m.followers : m.views;
    case 'followers':
    case 'fdiff_week':
    case 'fdiff_percent_week':
    case 'fdiff_month':
    case 'fdiff_percent_month':
    case 'active_ratio':
    case 'rank':
    default:
      // Diff/ratio/rank series are not tracked yet — sort by followers so
      // the parameter remains accepted and the ordering is still sensible.
      return m.followers;
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

  const m = metricsExprs(platform);
  const orderCol = sortExpression(sortColumn, m);
  const orderDir = sortOrderDesc ? 'DESC' : 'ASC';

  // We accumulate parameterised SQL fragments and their values, then run the
  // final string through $queryRawUnsafe with positional params.
  const conditions: string[] = ['p."platform" = $1'];
  const values: unknown[] = [platform];
  let paramIdx = 2;

  const addParam = (value: unknown): string => {
    values.push(value);
    return `$${paramIdx++}`;
  };

  if (code2 !== undefined) {
    conditions.push(`p."countryCode" = ${addParam(code2)}`);
  }

  if (editorial !== undefined) {
    conditions.push(
      editorial
        ? `p."playlistType" = 'editorial'`
        : `(p."playlistType" IS DISTINCT FROM 'editorial')`,
    );
  }

  if (topPlaylist !== undefined) {
    conditions.push(`p."isOfficial" = ${addParam(topPlaylist)}`);
  }

  if (descriptionSearch !== undefined) {
    conditions.push(`p."description" ILIKE ${addParam(`%${descriptionSearch}%`)}`);
  }

  // "Indie" = not an official/editorial account's playlist.
  if (indie !== undefined) {
    conditions.push(`p."isOfficial" = ${addParam(!indie)}`);
  }

  if (majorCurator !== undefined) {
    conditions.push(`p."isOfficial" = ${addParam(majorCurator)}`);
  }

  if (newMusicFriday !== undefined) {
    conditions.push(
      newMusicFriday
        ? `p."name" ILIKE '%new music friday%'`
        : `p."name" NOT ILIKE '%new music friday%'`,
    );
  }

  // Tag filter: playlist must have ALL requested tags (AND semantics)
  const tagSubqueries = tagIds.map((id) => {
    const p = addParam(id);
    return `EXISTS (
      SELECT 1 FROM playlist_tags pt
      WHERE pt."playlistId" = p."id" AND pt."tagId" = ${p}
    )`;
  });
  conditions.push(...tagSubqueries);

  // Shortlist filter
  if (shortlistIds.length > 0) {
    const placeholders = shortlistIds.map((id) => addParam(id)).join(', ');
    conditions.push(`p."id" IN (${placeholders})`);
  }

  // Curator include filter
  if (curatorIds.length > 0) {
    const placeholders = curatorIds.map((id) => addParam(id)).join(', ');
    conditions.push(
      `EXISTS (
        SELECT 1 FROM curator_playlists cp
        WHERE cp."playlistId" = p."id" AND cp."curatorId" IN (${placeholders})
      )`,
    );
  }

  // Curator exclude filter
  if (excludedCuratorIds.length > 0) {
    const placeholders = excludedCuratorIds.map((id) => addParam(id)).join(', ');
    conditions.push(
      `NOT EXISTS (
        SELECT 1 FROM curator_playlists cp
        WHERE cp."playlistId" = p."id" AND cp."curatorId" IN (${placeholders})
      )`,
    );
  }

  const whereClause = conditions.join(' AND ');

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM playlists p
    WHERE ${whereClause}
  `;

  const dataSql = `
    SELECT
      p."id"                          AS "playlistId",
      p."externalId"                  AS "externalPlaylistId",
      p."countryCode"                 AS "code2",
      p."name",
      p."imageUrl"                    AS "imageUrl",
      p."isAlgorithmic"               AS "personalized",
      p."updatedAt"                   AS "lastUpdated",
      c."name"                        AS "ownerName",
      c."id"                          AS "ownerId",
      c."externalId"                  AS "externalUserId",
      (p."playlistType" = 'editorial') AS "editorial",
      p."isOfficial"                  AS "topPlaylist",
      ${m.trackCount}                 AS "numTrack",
      NULL::text                      AS "genre",
      ${m.followers}                  AS "followers",
      ${m.views}                      AS "views",
      TRUE                            AS "latest",
      NULL::bigint                    AS "followerDiffWeek",
      NULL::float                     AS "followerDiffPercentWeek",
      NULL::bigint                    AS "followerDiffMonth",
      NULL::float                     AS "followerDiffPercentMonth",
      NULL::bigint                    AS "viewDiffWeek",
      NULL::bigint                    AS "viewDiffMonth",
      NULL::bigint                    AS "monthlyDiff",
      NULL::int                       AS "catalog",
      NULL::float                     AS "activeRatio",
      NULL::int                       AS "rank",
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', t."id", 'name', t."name"))
          FROM playlist_tags pt
          JOIN tags t ON t."id" = pt."tagId"
          WHERE pt."playlistId" = p."id"
        ),
        '[]'::json
      ) AS tags
    FROM playlists p
    LEFT JOIN ${m.table} m ON m."playlistId" = p."id"
    LEFT JOIN LATERAL (
      SELECT cu."id", cu."name", cu."externalId"
      FROM playlist_curator_links pcl
      JOIN curators cu ON cu."id" = pcl."curatorId"
      WHERE pcl."playlistId" = p."id"
      ORDER BY pcl."linkedAt" ASC
      LIMIT 1
    ) c ON TRUE
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
