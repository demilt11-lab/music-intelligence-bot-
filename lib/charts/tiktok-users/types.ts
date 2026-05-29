/**
 * TikTok User Chart – shared type definitions.
 * @module lib/charts/tiktok-users/types
 */

/** Chart metric dimension for the TikTok user chart. */
export type TikTokUserChartType = 'likes' | 'followers';

/** Time window for the TikTok user chart snapshot. */
export type TikTokUserChartInterval =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'semi_yearly'
  | 'yearly'
  | 'all_time';

/**
 * A single historical rank data-point for a TikTok creator on the chart.
 */
export interface TikTokUserRankStat {
  /** Chart rank at this point in time. */
  rank: number;
  /** Metric value (likes or followers) as a string to preserve bigint precision. */
  metricValue: string;
  /** ISO timestamp of this data-point. */
  timestp: string;
}

/**
 * A single row in the TikTok user chart response.
 */
export interface TikTokUserChartRow {
  /** Internal creator ID. */
  creatorId: number;
  /** All known external TikTok user IDs (e.g. numeric UID strings). */
  externalTikTokUserIds: string[];
  /** TikTok @username (without the @ prefix). */
  username: string | null;
  /** Display name of the creator. */
  name: string | null;
  /** Profile image URL. */
  imageUrl: string | null;
  /** Current chart rank. */
  rank: number;
  /** ISO date the creator was first added to the chart. */
  addedAt: string | null;
  /** Rank velocity (positive = rising). */
  velocity: number | null;
  /** Rank on the previous snapshot. */
  preRank: number | null;
  /** All-time peak rank on this chart. */
  peakRank: number | null;
  /** ISO date of the peak rank. */
  peakDate: string | null;
  /** Number of days on the chart. */
  timeOnChart: number | null;
  /** Which metric drives this chart entry ('likes' or 'followers'). */
  metricType: TikTokUserChartType;
  /** Current value of the primary metric as a string. */
  metricValue: string | null;
  /** Total likes as a string (bigint-safe). */
  likes: string | null;
  /** Total followers as a string (bigint-safe). */
  followers: string | null;
  /** Historical rank data-points. */
  rankStats: TikTokUserRankStat[];
  /** Chart time-window interval. */
  interval: TikTokUserChartInterval;
  /** ISO date of the source snapshot. */
  sourceDate: string;
}

/**
 * Top-level API response for the TikTok user chart endpoint.
 */
export interface TikTokUserChartResponse {
  obj: { length: number; data: TikTokUserChartRow[] };
}

/**
 * Validated query parameters for the TikTok user chart endpoint.
 */
export interface TikTokUserChartParams {
  /** Chart metric type ('likes' or 'followers'). */
  type: TikTokUserChartType;
  /** Time-window for the chart. */
  interval: TikTokUserChartInterval;
  /** Target chart date (YYYY-MM-DD). Null when `latest` is true. */
  date: string | null;
  /** Whether to return the most recent available snapshot. */
  latest: boolean;
  /** Maximum number of rows to return (1–100). */
  limit: number;
  /** Zero-based row offset for pagination (0–9900). */
  offset: number;
}
