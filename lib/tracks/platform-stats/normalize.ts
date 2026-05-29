import {
  PlatformStatSeries,
  StatDataPoint,
  TrackPlatformStatsParams,
} from './types';
import { RawStatRow } from './query';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerces a `bigint`, `number`, or `null` to its string representation.
 * Returns `"0"` for null/undefined values so downstream consumers always
 * receive a numeric string.
 */
function statToString(v: bigint | number | null | undefined): string {
  if (v === null || v === undefined) return '0';
  return String(v);
}

/**
 * Normalises a raw date value (ISO string or `Date` object) to a
 * `YYYY-MM-DD` string.
 */
function toDateString(v: string | Date): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/**
 * Linearly interpolates missing daily data points between two known values.
 *
 * @param points - Sparse array of data points, ordered by date ascending.
 * @returns Dense array with one entry per calendar day in the span.
 */
function interpolateDataPoints(points: StatDataPoint[]): StatDataPoint[] {
  if (points.length < 2) return points;

  const result: StatDataPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];

    result.push(curr);

    const currDate = new Date(curr.timestp);
    const nextDate = new Date(next.timestp);
    const daysBetween =
      (nextDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysBetween <= 1) continue;

    const startVal = parseFloat(curr.value);
    const endVal   = parseFloat(next.value);

    for (let d = 1; d < daysBetween; d++) {
      const interpDate = new Date(currDate);
      interpDate.setUTCDate(interpDate.getUTCDate() + d);
      const fraction = d / daysBetween;
      const interpVal = startVal + (endVal - startVal) * fraction;

      result.push({
        timestp: interpDate.toISOString().slice(0, 10),
        value:   String(Math.round(interpVal)),
      });
    }
  }

  // Push the last known point
  result.push(points[points.length - 1]);

  return result;
}

/**
 * Extrapolates data points before and/or after the known range by repeating
 * the boundary value.
 *
 * @param points  - Dense array of data points (may have been interpolated).
 * @param since   - ISO date string marking the start of the requested range.
 * @param until   - ISO date string marking the end of the requested range.
 * @param mode    - Extrapolation direction.
 * @returns Data points with boundary values extended to fill the full range.
 */
function extrapolateDataPoints(
  points: StatDataPoint[],
  since: string,
  until: string,
  mode: 'before' | 'after' | 'both',
): StatDataPoint[] {
  if (points.length === 0) return points;

  const result: StatDataPoint[] = [...points];

  const fillBefore = mode === 'before' || mode === 'both';
  const fillAfter  = mode === 'after'  || mode === 'both';

  if (fillBefore) {
    const firstPoint  = result[0];
    const firstDate   = new Date(firstPoint.timestp);
    const sinceDate   = new Date(since);

    const prefix: StatDataPoint[] = [];
    const cur = new Date(sinceDate);
    while (cur < firstDate) {
      prefix.push({
        timestp: cur.toISOString().slice(0, 10),
        value:   firstPoint.value,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    result.unshift(...prefix);
  }

  if (fillAfter) {
    const lastPoint = result[result.length - 1];
    const lastDate  = new Date(lastPoint.timestp);
    const untilDate = new Date(until);

    const cur = new Date(lastDate);
    cur.setUTCDate(cur.getUTCDate() + 1);
    while (cur <= untilDate) {
      result.push({
        timestp: cur.toISOString().slice(0, 10),
        value:   lastPoint.value,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts raw database rows into a structured array of {@link PlatformStatSeries}.
 *
 * Processing steps:
 * 1. Group rows by `platform_track_id`.
 * 2. Map each row to a {@link StatDataPoint}.
 * 3. Optionally apply linear interpolation when `params.interpolated` is `true`.
 * 4. Optionally extrapolate boundary values when `params.extrapolated` is set.
 *
 * @param rows   - Raw rows returned by {@link queryPlatformStats}.
 * @param params - Validated query parameters (controls interpolation / extrapolation).
 * @returns Array of platform stat series.
 */
export function normalizePlatformStats(
  rows: RawStatRow[],
  params: TrackPlatformStatsParams,
): PlatformStatSeries[] {
  if (rows.length === 0) return [];

  // Group by platform_track_id
  const grouped = new Map<string, StatDataPoint[]>();
  for (const row of rows) {
    const key = row.platform_track_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      timestp: toDateString(row.date),
      value:   statToString(row.stat_value),
    });
  }

  const series: PlatformStatSeries[] = [];

  for (const [platformTrackId, rawPoints] of grouped.entries()) {
    // Ensure ascending date order
    rawPoints.sort((a, b) => a.timestp.localeCompare(b.timestp));

    let points = rawPoints;

    if (params.interpolated) {
      points = interpolateDataPoints(points);
    }

    if (params.extrapolated) {
      points = extrapolateDataPoints(
        points,
        params.since,
        params.until,
        params.extrapolated,
      );
    }

    series.push({
      platform:        params.platform,
      platformTrackId,
      type:            params.type,
      data:            points,
    });
  }

  return series;
}
