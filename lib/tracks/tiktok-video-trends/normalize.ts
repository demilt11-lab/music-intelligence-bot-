import { TikTokVideoTrendPoint } from './types';
import { RawTikTokVideoMetricRow } from './query';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerces a `bigint`, `number`, or `null` to its string representation.
 * Returns `"0"` for absent values so consumers always receive a numeric string.
 */
function metricToString(v: bigint | number | null | undefined): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms an array of raw database rows from the TikTok video metrics query
 * into the typed {@link TikTokVideoTrendPoint} array expected by the API response.
 *
 * Each row is mapped 1-to-1:
 * - `date`     → `timestp` (normalised to `YYYY-MM-DD`)
 * - `likes`    → `likes`   (coerced to string)
 * - `comments` → `comments`(coerced to string)
 * - `views`    → `views`   (coerced to string)
 *
 * @param rows - Raw rows returned by {@link queryTikTokVideoTrends}.
 * @returns Array of trend points ordered by date ascending.
 */
export function normalizeTikTokVideoTrends(
  rows: RawTikTokVideoMetricRow[],
): TikTokVideoTrendPoint[] {
  return rows.map((row) => ({
    timestp:  toDateString(row.date),
    likes:    metricToString(row.likes),
    comments: metricToString(row.comments),
    views:    metricToString(row.views),
  }));
}
