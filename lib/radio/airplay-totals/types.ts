/**
 * Types for the deprecated aggregate Airplay Totals module.
 *
 * This module is a thin wrapper over the canonical airplay-by-entity module and
 * exists for backwards-compatibility with legacy consumers.
 */

import type {
  AirplayEntityType,
  AirplayCountryRow,
  AirplayCityRow,
  AirplayStationRow,
  AirplayTrackRow,
  AirplayTrendPoint,
} from '@/lib/radio/airplay-by-entity/types';

// Re-export the shared row types so callers can import them from one place.
export type {
  AirplayEntityType,
  AirplayCountryRow,
  AirplayCityRow,
  AirplayStationRow,
  AirplayTrackRow,
  AirplayTrendPoint,
};

/**
 * Legacy aggregate response shape.
 * Each dimension is a tuple of [row, trendPoints] for historical reasons.
 */
export interface AirplayTotalsResponse {
  obj: {
    countries: [AirplayCountryRow, AirplayTrendPoint[]][];
    cities:    [AirplayCityRow,    AirplayTrendPoint[]][];
    stations:  [AirplayStationRow, AirplayTrendPoint[]][];
    tracks:    [AirplayTrackRow,   AirplayTrendPoint[]][];
  };
}

/** Validated parameters for the aggregate airplay-totals query. */
export interface AirplayTotalsParams {
  /** Top-level entity type. */
  type: AirplayEntityType;
  /** Numeric ID of the entity. */
  id: number;
  /** ISO date string for the start of the query window. */
  since: string;
  /** Optional station filter (numeric station id). */
  station: number | undefined;
  /** Maximum rows per dimension (1–100). */
  limit: number;
}
