/**
 * Types for the Airplay-by-Entity module.
 */

/** The top-level entity whose airplay data is being queried. */
export type AirplayEntityType = 'artist' | 'album' | 'track';

/** The dimension across which airplay plays are broken down. */
export type AirplayEntityDimension = 'country' | 'city' | 'station' | 'track';

/** Format used for `air_date` values in trend points. */
export type TimestampFormat = 'ISO' | 'UNIX';

/** A single (date, play-count) point within a trend series. */
export interface AirplayTrendPoint {
  /** Date expressed as an ISO string or Unix timestamp depending on `dateFormat`. */
  air_date: string | number;
  /** Play count for this date, serialized as a string. */
  count: string;
}

/** Airplay breakdown row for a country dimension. */
export interface AirplayCountryRow {
  code2: string;
  name: string;
  /** Total plays, serialized as a string. */
  plays: string;
  plays_percent: number | null;
  plays_trend: AirplayTrendPoint[];
}

/** Airplay breakdown row for a city dimension. */
export interface AirplayCityRow {
  id: number;
  name: string;
  code2: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  /** Total plays, serialized as a string. */
  plays: string;
  plays_percent: number | null;
  plays_trend: AirplayTrendPoint[];
}

/** Airplay breakdown row for a station dimension. */
export interface AirplayStationRow {
  id: number;
  name: string;
  code2: string;
  city: string | null;
  country: string | null;
  /** Total plays, serialized as a string. */
  plays: string;
  plays_percent: number | null;
  plays_trend: AirplayTrendPoint[];
}

/** Airplay breakdown row for a track dimension. */
export interface AirplayTrackRow {
  id: number;
  name: string;
  isrc: string | null;
  /** Total plays, serialized as a string. */
  plays: string;
  plays_percent: number | null;
  plays_trend: AirplayTrendPoint[];
}

/** Union of all possible breakdown row types. */
export type AirplayEntityRow =
  | AirplayCountryRow
  | AirplayCityRow
  | AirplayStationRow
  | AirplayTrackRow;

/** API response envelope for airplay-by-entity. */
export interface AirplayByEntityResponse {
  obj: AirplayEntityRow[];
}

/** Validated parameters for the airplay-by-entity query. */
export interface AirplayByEntityParams {
  /** Top-level entity type. */
  type: AirplayEntityType;
  /** Numeric ID of the entity. */
  id: number;
  /** Dimension across which plays are broken down. */
  entity: AirplayEntityDimension;
  /** ISO date string for the start of the query window. */
  since: string;
  /** Optional station filter (numeric station id). */
  station: number | undefined;
  /** Maximum number of rows to return (1–100). */
  limit: number;
  /** How `air_date` values should be formatted in trend points. */
  dateFormat: TimestampFormat;
}
