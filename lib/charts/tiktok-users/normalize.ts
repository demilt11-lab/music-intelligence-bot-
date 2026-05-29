/**
 * TikTok User Chart – row normalisation.
 * @module lib/charts/tiktok-users/normalize
 */

import {
  TikTokUserChartRow,
  TikTokUserChartType,
  TikTokUserRankStat,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a bigint, number, or null/undefined to its string representation.
 * Returns `null` when the value is absent.
 */
function bigToStr(v: bigint | string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Converts a bigint or number to a JS `number`.
 * Returns `null` when the value is absent.
 */
function toNum(v: bigint | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Normalises a Date object or ISO string to a `YYYY-MM-DD` string.
 * Returns `null` when the value is absent.
 */
function toDate(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/**
 * Parses a JSON string representing a list of rank-stat objects.
 * Returns an empty array on failure.
 */
function parseRankStats(raw: string | null | undefined): TikTokUserRankStat[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      rank: Number(item.rank),
      metricValue: String(item.metricValue ?? '0'),
      timestp: String(item.timestp ?? ''),
    }));
  } catch {
    return [];
  }
}

/**
 * Parses a JSON string representing an array of external ID strings.
 * Returns an empty array on failure.
 */
function parseExternalIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(String);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms an array of raw database rows into typed
 * {@link TikTokUserChartRow} objects suitable for API serialisation.
 *
 * @param rows      - Raw rows returned by {@link queryTikTokUserChart}.
 * @param chartType - The metric type for this chart ('likes' | 'followers').
 * @param interval  - The chart time-window interval.
 * @returns Normalised chart rows.
 */
export function normalizeTikTokUserChartRows(
  rows: any[],
  chartType: TikTokUserChartType,
  interval: TikTokUserChartRow['interval'],
): TikTokUserChartRow[] {
  return rows.map((row) => ({
    creatorId: toNum(row.creator_id) as number,
    externalTikTokUserIds: parseExternalIds(row.external_ids_json),
    username: row.username ?? null,
    name: row.name ?? null,
    imageUrl: row.image_url ?? null,
    rank: Number(row.rank),
    addedAt: toDate(row.added_at),
    velocity: row.velocity !== null && row.velocity !== undefined ? Number(row.velocity) : null,
    preRank: row.pre_rank !== null && row.pre_rank !== undefined ? Number(row.pre_rank) : null,
    peakRank: row.peak_rank !== null && row.peak_rank !== undefined ? Number(row.peak_rank) : null,
    peakDate: toDate(row.peak_date),
    timeOnChart: row.time_on_chart !== null && row.time_on_chart !== undefined ? Number(row.time_on_chart) : null,
    metricType: chartType,
    metricValue: bigToStr(row.metric_value),
    likes: bigToStr(row.likes),
    followers: bigToStr(row.followers),
    rankStats: parseRankStats(row.rank_stats_json),
    interval,
    sourceDate: String(row.source_date).slice(0, 10),
  }));
}
