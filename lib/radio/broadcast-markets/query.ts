/**
 * Database queries for the Broadcast Markets module.
 *
 * Aggregates plays from `radio_airplay_facts` joined against
 * `radio_country_markets` and `radio_city_markets` to produce market-level
 * ratio data.  All aggregate count fields are returned as decimal strings via
 * PostgreSQL `::text` casts to avoid JS BigInt precision loss.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { BroadcastMarketsParams } from './types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Returns the fact-table FK column name for the given entity type. */
function entityFk(type: BroadcastMarketsParams['type']): string {
  const map: Record<string, string> = {
    artist: 'artist_id',
    album:  'album_id',
    track:  'track_id',
  };
  return map[type];
}

// ---------------------------------------------------------------------------
// Country ratios
// ---------------------------------------------------------------------------

/**
 * Queries country-level broadcast market ratios.
 *
 * For each country that has at least one play, returns:
 *  - The play count for that country (`market_count_data`)
 *  - The total play count across all countries (`total_market_count_data`)
 *  - The play ratio (`count`) as a decimal string
 *  - The number of distinct broadcasting stations (`count_of_stations`)
 *  - Country geo/population metadata
 */
async function queryCountryRatios(params: BroadcastMarketsParams): Promise<any[]> {
  const fkCol = entityFk(params.type);

  return db.$queryRaw<any[]>`
    WITH country_plays AS (
      SELECT
        rs.country                              AS code2,
        SUM(f.plays)::numeric                  AS market_count_data,
        COUNT(DISTINCT f.station_id)::int       AS count_of_stations
      FROM radio_airplay_facts f
      JOIN radio_stations rs ON rs.id = f.station_id
      WHERE f.${Prisma.raw(fkCol)} = ${params.id}
        AND f.air_date >= ${params.since}::date
      GROUP BY rs.country
    ),
    grand_total AS (
      SELECT SUM(market_count_data)::numeric AS total FROM country_plays
    )
    SELECT
      COALESCE(rcm.market_name, cp.code2)            AS market,
      cp.market_count_data::text                     AS market_count_data,
      cp.code2,
      gt.total::text                                 AS total_market_count_data,
      cp.count_of_stations,
      c.population,
      c.lat::float                                   AS lat,
      c.lng::float                                   AS lng,
      CASE WHEN gt.total > 0
        THEN (cp.market_count_data / gt.total)::text
        ELSE '0'
      END                                            AS count
    FROM country_plays cp
    CROSS JOIN grand_total gt
    LEFT JOIN radio_country_markets rcm ON rcm.code2 = cp.code2
    LEFT JOIN countries c ON c.code = cp.code2
    ORDER BY cp.market_count_data DESC
  `;
}

// ---------------------------------------------------------------------------
// City ratios
// ---------------------------------------------------------------------------

/**
 * Queries city-level broadcast market ratios.
 *
 * For each city that has at least one play, returns:
 *  - The play count for that city (`market_count_data`)
 *  - The total play count across all cities (`total_market_count_data`)
 *  - The play ratio (`count`) as a decimal string
 *  - The number of distinct broadcasting stations (`count_of_stations`)
 *  - City geo/population metadata
 */
async function queryCityRatios(params: BroadcastMarketsParams): Promise<any[]> {
  const fkCol = entityFk(params.type);

  return db.$queryRaw<any[]>`
    WITH city_plays AS (
      SELECT
        rs.city_id                              AS city_id,
        SUM(f.plays)::numeric                  AS market_count_data,
        COUNT(DISTINCT f.station_id)::int       AS count_of_stations
      FROM radio_airplay_facts f
      JOIN radio_stations rs ON rs.id = f.station_id
      WHERE f.${Prisma.raw(fkCol)} = ${params.id}
        AND f.air_date >= ${params.since}::date
        AND rs.city_id IS NOT NULL
      GROUP BY rs.city_id
    ),
    grand_total AS (
      SELECT SUM(market_count_data)::numeric AS total FROM city_plays
    )
    SELECT
      COALESCE(ci.name, rcm.market_name, cp.city_id::text)          AS market,
      COALESCE(
        ci.name || COALESCE(', ' || ci.country, ''),
        cp.city_id::text
      )                                                              AS display_name,
      COALESCE(ci.code2, '')                                         AS code2,
      cp.market_count_data::text                                     AS market_count_data,
      ci.country,
      gt.total::text                                                 AS total_market_count_data,
      cp.count_of_stations,
      cp.city_id,
      ci.population,
      ci.lat::float                                                  AS lat,
      ci.lng::float                                                  AS lng,
      CASE WHEN gt.total > 0
        THEN (cp.market_count_data / gt.total)::text
        ELSE '0'
      END                                                            AS count
    FROM city_plays cp
    CROSS JOIN grand_total gt
    LEFT JOIN cities ci ON ci.id = cp.city_id
    LEFT JOIN radio_city_markets rcm ON rcm.city_id = cp.city_id
    ORDER BY cp.market_count_data DESC
  `;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Executes both country- and city-level broadcast market queries in parallel.
 *
 * @param params - Validated {@link BroadcastMarketsParams}.
 * @returns Raw rows for both dimensions.
 */
export async function queryBroadcastMarkets(params: BroadcastMarketsParams): Promise<{
  countryRatios: any[];
  cityRatios:    any[];
}> {
  const [countryRatios, cityRatios] = await Promise.all([
    queryCountryRatios(params),
    queryCityRatios(params),
  ]);

  return { countryRatios, cityRatios };
}
