/**
 * Database queries for the Airplay-by-Entity module.
 *
 * Aggregates plays from `radio_airplay_facts` broken down by a chosen dimension
 * (country / city / station / track).  Each row includes the total plays, the
 * percentage share of all plays in the window, and an array of daily trend points.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { AirplayByEntityParams } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the WHERE clause fragments shared by every dimension query.
 * Returns an array of Prisma raw SQL fragments so they can be interpolated safely.
 */
function buildBaseWhere(params: AirplayByEntityParams) {
  const { type, id, since, station } = params;

  // Identify the FK column that corresponds to the entity type.
  const entityFkMap: Record<string, string> = {
    artist: 'artist_id',
    album:  'album_id',
    track:  'track_id',
  };
  const fkCol = entityFkMap[type];

  return { fkCol, id, since, station };
}

// ---------------------------------------------------------------------------
// Per-dimension queries
// ---------------------------------------------------------------------------

/**
 * Queries airplay broken down by **country**.
 */
async function queryByCountry(params: AirplayByEntityParams): Promise<any[]> {
  const { fkCol, id, since, station, limit } = { ...buildBaseWhere(params), limit: params.limit };

  const stationFilter = station != null
    ? Prisma.sql`AND f.station_id = ${station}`
    : Prisma.sql``;

  return db.$queryRaw<any[]>`
    WITH plays_per_country AS (
      SELECT
        rs.country                                   AS code2,
        SUM(f.plays)::bigint                         AS total_plays,
        json_agg(
          json_build_object(
            'air_date', f.air_date::text,
            'count',    f.plays::text
          ) ORDER BY f.air_date
        )                                            AS raw_trend
      FROM radio_airplay_facts f
      JOIN radio_stations rs ON rs.id = f.station_id
      WHERE f.${Prisma.raw(fkCol)} = ${id}
        AND f.air_date >= ${since}::date
        ${stationFilter}
      GROUP BY rs.country
    ),
    totals AS (
      SELECT SUM(total_plays)::bigint AS grand_total FROM plays_per_country
    )
    SELECT
      p.code2,
      COALESCE(c.name, p.code2)          AS name,
      p.total_plays::text                AS plays,
      CASE WHEN t.grand_total > 0
        THEN ROUND(p.total_plays * 100.0 / t.grand_total, 4)::float
        ELSE NULL
      END                                AS plays_percent,
      p.raw_trend
    FROM plays_per_country p
    CROSS JOIN totals t
    LEFT JOIN countries c ON c.code2 = p.code2
    ORDER BY p.total_plays DESC
    LIMIT ${limit}
  `;
}

/**
 * Queries airplay broken down by **city**.
 */
async function queryByCity(params: AirplayByEntityParams): Promise<any[]> {
  const { fkCol, id, since, station, limit } = { ...buildBaseWhere(params), limit: params.limit };

  const stationFilter = station != null
    ? Prisma.sql`AND f.station_id = ${station}`
    : Prisma.sql``;

  return db.$queryRaw<any[]>`
    WITH plays_per_city AS (
      SELECT
        rs.city_id                                   AS city_id,
        SUM(f.plays)::bigint                         AS total_plays,
        json_agg(
          json_build_object(
            'air_date', f.air_date::text,
            'count',    f.plays::text
          ) ORDER BY f.air_date
        )                                            AS raw_trend
      FROM radio_airplay_facts f
      JOIN radio_stations rs ON rs.id = f.station_id
      WHERE f.${Prisma.raw(fkCol)} = ${id}
        AND f.air_date >= ${since}::date
        ${stationFilter}
      GROUP BY rs.city_id
    ),
    totals AS (
      SELECT SUM(total_plays)::bigint AS grand_total FROM plays_per_city
    )
    SELECT
      p.city_id                           AS id,
      COALESCE(ci.name, '')               AS name,
      COALESCE(ci.code2, '')              AS code2,
      ci.country                          AS country,
      ci.lat::float                       AS lat,
      ci.lng::float                       AS lng,
      p.total_plays::text                 AS plays,
      CASE WHEN t.grand_total > 0
        THEN ROUND(p.total_plays * 100.0 / t.grand_total, 4)::float
        ELSE NULL
      END                                 AS plays_percent,
      p.raw_trend
    FROM plays_per_city p
    CROSS JOIN totals t
    LEFT JOIN cities ci ON ci.id = p.city_id
    ORDER BY p.total_plays DESC
    LIMIT ${limit}
  `;
}

/**
 * Queries airplay broken down by **station**.
 */
async function queryByStation(params: AirplayByEntityParams): Promise<any[]> {
  const { fkCol, id, since, station, limit } = { ...buildBaseWhere(params), limit: params.limit };

  const stationFilter = station != null
    ? Prisma.sql`AND f.station_id = ${station}`
    : Prisma.sql``;

  return db.$queryRaw<any[]>`
    WITH plays_per_station AS (
      SELECT
        f.station_id                                 AS station_id,
        SUM(f.plays)::bigint                         AS total_plays,
        json_agg(
          json_build_object(
            'air_date', f.air_date::text,
            'count',    f.plays::text
          ) ORDER BY f.air_date
        )                                            AS raw_trend
      FROM radio_airplay_facts f
      WHERE f.${Prisma.raw(fkCol)} = ${id}
        AND f.air_date >= ${since}::date
        ${stationFilter}
      GROUP BY f.station_id
    ),
    totals AS (
      SELECT SUM(total_plays)::bigint AS grand_total FROM plays_per_station
    )
    SELECT
      p.station_id                        AS id,
      COALESCE(rs.name, '')               AS name,
      COALESCE(rs.country, '')            AS code2,
      rs.market                           AS city,
      rs.country                          AS country,
      p.total_plays::text                 AS plays,
      CASE WHEN t.grand_total > 0
        THEN ROUND(p.total_plays * 100.0 / t.grand_total, 4)::float
        ELSE NULL
      END                                 AS plays_percent,
      p.raw_trend
    FROM plays_per_station p
    CROSS JOIN totals t
    LEFT JOIN radio_stations rs ON rs.id = p.station_id
    ORDER BY p.total_plays DESC
    LIMIT ${limit}
  `;
}

/**
 * Queries airplay broken down by **track**.
 * Only meaningful when `type` is 'artist' or 'album'.
 */
async function queryByTrack(params: AirplayByEntityParams): Promise<any[]> {
  const { fkCol, id, since, station, limit } = { ...buildBaseWhere(params), limit: params.limit };

  const stationFilter = station != null
    ? Prisma.sql`AND f.station_id = ${station}`
    : Prisma.sql``;

  return db.$queryRaw<any[]>`
    WITH plays_per_track AS (
      SELECT
        f.track_id                                   AS track_id,
        SUM(f.plays)::bigint                         AS total_plays,
        json_agg(
          json_build_object(
            'air_date', f.air_date::text,
            'count',    f.plays::text
          ) ORDER BY f.air_date
        )                                            AS raw_trend
      FROM radio_airplay_facts f
      WHERE f.${Prisma.raw(fkCol)} = ${id}
        AND f.air_date >= ${since}::date
        ${stationFilter}
      GROUP BY f.track_id
    ),
    totals AS (
      SELECT SUM(total_plays)::bigint AS grand_total FROM plays_per_track
    )
    SELECT
      p.track_id                          AS id,
      COALESCE(tr.name, '')               AS name,
      tr.isrc                             AS isrc,
      p.total_plays::text                 AS plays,
      CASE WHEN t.grand_total > 0
        THEN ROUND(p.total_plays * 100.0 / t.grand_total, 4)::float
        ELSE NULL
      END                                 AS plays_percent,
      p.raw_trend
    FROM plays_per_track p
    CROSS JOIN totals t
    LEFT JOIN tracks tr ON tr.id = p.track_id
    ORDER BY p.total_plays DESC
    LIMIT ${limit}
  `;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Dispatches to the appropriate dimension-specific query based on `params.entity`.
 *
 * @param params - Fully validated {@link AirplayByEntityParams}.
 * @returns Raw database rows for the requested dimension.
 */
export async function queryAirplayByEntity(params: AirplayByEntityParams): Promise<any[]> {
  switch (params.entity) {
    case 'country': return queryByCountry(params);
    case 'city':    return queryByCity(params);
    case 'station': return queryByStation(params);
    case 'track':   return queryByTrack(params);
  }
}
