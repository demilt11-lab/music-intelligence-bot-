/**
 * Types for the Broadcast Markets module.
 */

import type { AirplayEntityType } from '@/lib/radio/airplay-by-entity/types';

export type { AirplayEntityType };

/**
 * Aggregate market data broken down by **country**.
 * All ratio/count fields are decimal strings to avoid JS precision loss.
 */
export interface CountryRatioRow {
  /** Market name (typically the country name or region label). */
  market: string;
  /** Play count for this market, as a decimal string. */
  market_count_data: string;
  /** ISO 3166-1 alpha-2 country code. */
  code2: string;
  /** Total play count across all markets, as a decimal string. */
  total_market_count_data: string;
  /** Number of distinct stations contributing plays in this market. */
  count_of_stations: number;
  /** Population of the country, if available. */
  population: number | null;
  /** Latitude of the country centroid, if available. */
  lat: number | null;
  /** Longitude of the country centroid, if available. */
  lng: number | null;
  /** Ratio of this market's plays vs. total, as a decimal string. */
  count: string;
}

/**
 * Aggregate market data broken down by **city**.
 * All ratio/count fields are decimal strings to avoid JS precision loss.
 */
export interface CityRatioRow {
  /** Market name (the city name). */
  market: string;
  /** Human-readable display name including region/country context. */
  display_name: string;
  /** ISO 3166-1 alpha-2 country code for the city. */
  code2: string;
  /** Play count for this city market, as a decimal string. */
  market_count_data: string;
  /** Country name, if available. */
  country: string | null;
  /** Total play count across all city markets, as a decimal string. */
  total_market_count_data: string;
  /** Number of distinct stations contributing plays in this city. */
  count_of_stations: number;
  /** Numeric city ID. */
  city_id: number;
  /** Population of the city, if available. */
  population: number | null;
  /** Latitude of the city, if available. */
  lat: number | null;
  /** Longitude of the city, if available. */
  lng: number | null;
  /** Ratio of this city's plays vs. total, as a decimal string. */
  count: string;
}

/** API response envelope for broadcast markets. */
export interface BroadcastMarketsResponse {
  obj: {
    countryRatios: CountryRatioRow[];
    cityRatios:    CityRatioRow[];
  };
}

/** Validated parameters for the broadcast-markets query. */
export interface BroadcastMarketsParams {
  /** Top-level entity type. */
  type: AirplayEntityType;
  /** Numeric ID of the entity. */
  id: number;
  /** ISO date string for the start of the query window. */
  since: string;
}
