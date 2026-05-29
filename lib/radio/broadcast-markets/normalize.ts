/**
 * Normalizers for the Broadcast Markets module.
 *
 * Converts raw database rows into the typed {@link BroadcastMarketsResponse}
 * shape.  All aggregate count fields are returned as decimal strings.
 */

import type {
  BroadcastMarketsResponse,
  CountryRatioRow,
  CityRatioRow,
} from './types';

/**
 * Normalizes a raw country-ratio database row into a {@link CountryRatioRow}.
 *
 * @param row - Raw row from the country-ratios query.
 * @returns Typed {@link CountryRatioRow}.
 */
function normalizeCountryRatioRow(row: any): CountryRatioRow {
  return {
    market:                  row.market ?? '',
    market_count_data:       String(row.market_count_data ?? '0'),
    code2:                   row.code2 ?? '',
    total_market_count_data: String(row.total_market_count_data ?? '0'),
    count_of_stations:       Number(row.count_of_stations ?? 0),
    population:              row.population != null ? Number(row.population) : null,
    lat:                     row.lat != null ? Number(row.lat) : null,
    lng:                     row.lng != null ? Number(row.lng) : null,
    count:                   String(row.count ?? '0'),
  };
}

/**
 * Normalizes a raw city-ratio database row into a {@link CityRatioRow}.
 *
 * @param row - Raw row from the city-ratios query.
 * @returns Typed {@link CityRatioRow}.
 */
function normalizeCityRatioRow(row: any): CityRatioRow {
  return {
    market:                  row.market ?? '',
    display_name:            row.display_name ?? '',
    code2:                   row.code2 ?? '',
    market_count_data:       String(row.market_count_data ?? '0'),
    country:                 row.country ?? null,
    total_market_count_data: String(row.total_market_count_data ?? '0'),
    count_of_stations:       Number(row.count_of_stations ?? 0),
    city_id:                 Number(row.city_id ?? 0),
    population:              row.population != null ? Number(row.population) : null,
    lat:                     row.lat != null ? Number(row.lat) : null,
    lng:                     row.lng != null ? Number(row.lng) : null,
    count:                   String(row.count ?? '0'),
  };
}

/**
 * Converts the raw query result into a typed {@link BroadcastMarketsResponse}.
 *
 * @param raw - Raw rows from {@link queryBroadcastMarkets}.
 * @returns Normalized {@link BroadcastMarketsResponse}.
 */
export function normalizeBroadcastMarkets(raw: {
  countryRatios: any[];
  cityRatios:    any[];
}): BroadcastMarketsResponse {
  return {
    obj: {
      countryRatios: raw.countryRatios.map(normalizeCountryRatioRow),
      cityRatios:    raw.cityRatios.map(normalizeCityRatioRow),
    },
  };
}
