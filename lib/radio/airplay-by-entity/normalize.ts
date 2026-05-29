/**
 * Normalizers for the Airplay-by-Entity module.
 *
 * Converts raw database rows into typed response shapes and applies the
 * requested date format to trend-point `air_date` values.
 */

import type {
  AirplayCountryRow,
  AirplayCityRow,
  AirplayStationRow,
  AirplayTrackRow,
  AirplayEntityDimension,
  AirplayEntityRow,
  AirplayTrendPoint,
  TimestampFormat,
} from './types';

// ---------------------------------------------------------------------------
// Trend helpers
// ---------------------------------------------------------------------------

/**
 * Parses the raw `raw_trend` JSON array from the database and converts each
 * `air_date` to the requested format.
 *
 * PostgreSQL returns `air_date` as an ISO date string ("YYYY-MM-DD").
 * When `dateFormat` is `'UNIX'` the value is converted to a Unix timestamp
 * (seconds since epoch, midnight UTC).
 *
 * @param rawTrend   - Array of `{ air_date, count }` objects from the DB.
 * @param dateFormat - Target format for the `air_date` field.
 * @returns Typed array of {@link AirplayTrendPoint}.
 */
function normalizeTrend(rawTrend: any, dateFormat: TimestampFormat): AirplayTrendPoint[] {
  if (!Array.isArray(rawTrend)) return [];

  return rawTrend.map((pt: any) => {
    const isoDate: string = pt.air_date ?? '';
    const air_date: string | number =
      dateFormat === 'UNIX'
        ? Math.floor(new Date(isoDate).getTime() / 1000)
        : isoDate;

    return { air_date, count: String(pt.count ?? '0') };
  });
}

// ---------------------------------------------------------------------------
// Per-dimension normalizers
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw country-dimension row.
 */
function normalizeCountryRow(row: any, dateFormat: TimestampFormat): AirplayCountryRow {
  return {
    code2:         row.code2 ?? '',
    name:          row.name ?? '',
    plays:         String(row.plays ?? '0'),
    plays_percent: row.plays_percent != null ? Number(row.plays_percent) : null,
    plays_trend:   normalizeTrend(row.raw_trend, dateFormat),
  };
}

/**
 * Normalizes a raw city-dimension row.
 */
function normalizeCityRow(row: any, dateFormat: TimestampFormat): AirplayCityRow {
  return {
    id:            Number(row.id),
    name:          row.name ?? '',
    code2:         row.code2 ?? '',
    country:       row.country ?? null,
    lat:           row.lat != null ? Number(row.lat) : null,
    lng:           row.lng != null ? Number(row.lng) : null,
    plays:         String(row.plays ?? '0'),
    plays_percent: row.plays_percent != null ? Number(row.plays_percent) : null,
    plays_trend:   normalizeTrend(row.raw_trend, dateFormat),
  };
}

/**
 * Normalizes a raw station-dimension row.
 */
function normalizeStationRow(row: any, dateFormat: TimestampFormat): AirplayStationRow {
  return {
    id:            Number(row.id),
    name:          row.name ?? '',
    code2:         row.code2 ?? '',
    city:          row.city ?? null,
    country:       row.country ?? null,
    plays:         String(row.plays ?? '0'),
    plays_percent: row.plays_percent != null ? Number(row.plays_percent) : null,
    plays_trend:   normalizeTrend(row.raw_trend, dateFormat),
  };
}

/**
 * Normalizes a raw track-dimension row.
 */
function normalizeTrackRow(row: any, dateFormat: TimestampFormat): AirplayTrackRow {
  return {
    id:            Number(row.id),
    name:          row.name ?? '',
    isrc:          row.isrc ?? null,
    plays:         String(row.plays ?? '0'),
    plays_percent: row.plays_percent != null ? Number(row.plays_percent) : null,
    plays_trend:   normalizeTrend(row.raw_trend, dateFormat),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Converts an array of raw database rows into typed {@link AirplayEntityRow}
 * objects for the requested dimension.
 *
 * @param rows       - Raw rows returned by the dimension-specific query.
 * @param entity     - Dimension that was queried.
 * @param dateFormat - Format to apply to `air_date` values in trend points.
 * @returns Typed array of {@link AirplayEntityRow}.
 */
export function normalizeAirplayByEntity(
  rows: any[],
  entity: AirplayEntityDimension,
  dateFormat: TimestampFormat,
): AirplayEntityRow[] {
  switch (entity) {
    case 'country':
      return rows.map((r) => normalizeCountryRow(r, dateFormat));
    case 'city':
      return rows.map((r) => normalizeCityRow(r, dateFormat));
    case 'station':
      return rows.map((r) => normalizeStationRow(r, dateFormat));
    case 'track':
      return rows.map((r) => normalizeTrackRow(r, dateFormat));
  }
}

// Re-export individual normalizers so the airplay-totals module can reuse them.
export {
  normalizeCountryRow,
  normalizeCityRow,
  normalizeStationRow,
  normalizeTrackRow,
};
