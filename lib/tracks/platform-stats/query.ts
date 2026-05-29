import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { TrackPlatformStatsParams } from './types';
import { getPlatformConfig } from './platform-config';
import { badRequest } from '@/lib/shared/errors';

/**
 * Raw row shape returned by the platform-stats query.
 * All numeric stat values may come back as `bigint` from PostgreSQL.
 */
export interface RawStatRow {
  /** Platform-specific external track identifier. */
  platform_track_id: string;
  /** Observation date as an ISO date string. */
  date: string | Date;
  /** Primary stat value (interpretation depends on stat type). */
  stat_value: bigint | number | null;
}

/**
 * Queries `track_platform_stats_daily` for time-series data for a given
 * track × platform × stat-type combination.
 *
 * When `params.latest` is `true`, only the most recent row is returned.
 *
 * When `params.mode === 'highest-playcounts'`, results are ordered by
 * stat_value descending and grouped by platform_track_id to select the
 * series with the highest cumulative value.
 *
 * When `params.mode === 'most-history'`, the platform_track_id with the
 * greatest number of data points in the date range is chosen.
 *
 * Results are always returned ordered by date ascending.
 *
 * @param params - Validated platform-stats query parameters.
 * @returns Array of raw stat rows.
 * @throws {ApiError} 400 when the platform is unsupported.
 */
export async function queryPlatformStats(
  params: TrackPlatformStatsParams,
): Promise<RawStatRow[]> {
  const { trackId, platform, type, since, until, latest, mode } = params;

  const config = getPlatformConfig(platform);
  if (!config) {
    throw badRequest(
      `Platform "${platform}" is not supported.`,
    );
  }

  const dbColumn = config.columnMap[type];
  if (!dbColumn) {
    throw badRequest(
      `Stat type "${type}" is not configured for platform "${platform}".`,
    );
  }

  // Determine the platform_track_id to use based on mode. We first find the
  // best platform_track_id, then fetch its full time-series.

  if (latest) {
    // Return only the most recent row for this track × platform
    return db.$queryRaw<RawStatRow[]>`
      SELECT
        ei.external_id            AS platform_track_id,
        tpsd.date::text           AS date,
        tpsd.${Prisma.raw(dbColumn)}::text AS stat_value
      FROM track_platform_stats_daily tpsd
      JOIN external_ids ei
        ON  ei.entity_id   = tpsd.track_id
        AND ei.entity_type = 'track'
        AND ei.platform    = ${platform}
      WHERE tpsd.track_id = ${trackId}
        AND tpsd.platform = ${platform}
        AND tpsd.${Prisma.raw(dbColumn)} IS NOT NULL
      ORDER BY tpsd.date DESC
      LIMIT 1
    `;
  }

  // ── Step 1: Identify the best platform_track_id ───────────────────────────
  let bestPlatformTrackId: string | null = null;

  if (mode === 'highest-playcounts') {
    const rows = await db.$queryRaw<{ platform_track_id: string }[]>`
      SELECT
        ei.external_id AS platform_track_id,
        SUM(tpsd.${Prisma.raw(dbColumn)}::bigint) AS total_value
      FROM track_platform_stats_daily tpsd
      JOIN external_ids ei
        ON  ei.entity_id   = tpsd.track_id
        AND ei.entity_type = 'track'
        AND ei.platform    = ${platform}
      WHERE tpsd.track_id = ${trackId}
        AND tpsd.platform = ${platform}
        AND tpsd.date    >= ${since}::date
        AND tpsd.date    <= ${until}::date
        AND tpsd.${Prisma.raw(dbColumn)} IS NOT NULL
      GROUP BY ei.external_id
      ORDER BY total_value DESC NULLS LAST
      LIMIT 1
    `;
    bestPlatformTrackId = rows[0]?.platform_track_id ?? null;
  } else {
    // mode === 'most-history'
    const rows = await db.$queryRaw<{ platform_track_id: string }[]>`
      SELECT
        ei.external_id AS platform_track_id,
        COUNT(*)       AS row_count
      FROM track_platform_stats_daily tpsd
      JOIN external_ids ei
        ON  ei.entity_id   = tpsd.track_id
        AND ei.entity_type = 'track'
        AND ei.platform    = ${platform}
      WHERE tpsd.track_id = ${trackId}
        AND tpsd.platform = ${platform}
        AND tpsd.date    >= ${since}::date
        AND tpsd.date    <= ${until}::date
        AND tpsd.${Prisma.raw(dbColumn)} IS NOT NULL
      GROUP BY ei.external_id
      ORDER BY row_count DESC
      LIMIT 1
    `;
    bestPlatformTrackId = rows[0]?.platform_track_id ?? null;
  }

  if (!bestPlatformTrackId) {
    // No data found — return empty
    return [];
  }

  // ── Step 2: Fetch the full time-series for the chosen platform_track_id ───
  return db.$queryRaw<RawStatRow[]>`
    SELECT
      ei.external_id                   AS platform_track_id,
      tpsd.date::text                  AS date,
      tpsd.${Prisma.raw(dbColumn)}::text AS stat_value
    FROM track_platform_stats_daily tpsd
    JOIN external_ids ei
      ON  ei.entity_id   = tpsd.track_id
      AND ei.entity_type = 'track'
      AND ei.platform    = ${platform}
    WHERE tpsd.track_id     = ${trackId}
      AND tpsd.platform     = ${platform}
      AND ei.external_id    = ${bestPlatformTrackId}
      AND tpsd.date        >= ${since}::date
      AND tpsd.date        <= ${until}::date
      AND tpsd.${Prisma.raw(dbColumn)} IS NOT NULL
    ORDER BY tpsd.date ASC
  `;
}
