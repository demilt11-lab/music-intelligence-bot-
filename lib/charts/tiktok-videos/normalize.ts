import {
  TikTokVideoChartRow,
  TikTokVideoRankStat,
  TikTokVideoViewStat,
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
function parseRankStats(raw: string | null | undefined): TikTokVideoRankStat[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      rank: Number(item.rank),
      views: String(item.views ?? '0'),
      timestp: String(item.timestp ?? ''),
    }));
  } catch {
    return [];
  }
}

/**
 * Parses a JSON string representing a list of view-stat objects.
 * Returns an empty array on failure.
 */
function parseViewStats(raw: string | null | undefined): TikTokVideoViewStat[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      views: String(item.views ?? '0'),
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
 * {@link TikTokVideoChartRow} objects suitable for API serialisation.
 *
 * @param rows - Raw rows returned by {@link queryTikTokVideoChart}.
 * @returns Normalised chart rows.
 */
export function normalizeTikTokVideoChartRows(rows: any[]): TikTokVideoChartRow[] {
  return rows.map((row) => ({
    videoId: toNum(row.video_id) as number,
    externalTikTokVideoIds: parseExternalIds(row.external_ids_json),
    linkedTrackId: toNum(row.linked_track_id),
    name: row.name ?? null,
    rank: Number(row.rank),
    addedAt: toDate(row.added_at),
    velocity: row.velocity !== null && row.velocity !== undefined ? Number(row.velocity) : null,
    preRank: row.pre_rank !== null && row.pre_rank !== undefined ? Number(row.pre_rank) : null,
    peakRank: row.peak_rank !== null && row.peak_rank !== undefined ? Number(row.peak_rank) : null,
    peakDate: toDate(row.peak_date),
    timeOnChart: row.time_on_chart !== null && row.time_on_chart !== undefined ? Number(row.time_on_chart) : null,
    views: bigToStr(row.views),
    likes: bigToStr(row.likes),
    comments: bigToStr(row.comments),
    rankStats: parseRankStats(row.rank_stats_json),
    viewStats: parseViewStats(row.view_stats_json),
    sourceDate: String(row.source_date).slice(0, 10),
  }));
}
