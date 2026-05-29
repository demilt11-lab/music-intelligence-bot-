/**
 * Rank statistics entry for a TikTok video on the chart.
 */
export interface TikTokVideoRankStat {
  rank: number;
  views: string;
  timestp: string;
}

/**
 * View statistics entry for a TikTok video over time.
 */
export interface TikTokVideoViewStat {
  views: string;
  timestp: string;
}

/**
 * A single row in the TikTok video chart response.
 */
export interface TikTokVideoChartRow {
  /** Internal video ID. */
  videoId: number;
  /** All known external TikTok video IDs. */
  externalTikTokVideoIds: string[];
  /** Linked internal track ID, if any. */
  linkedTrackId: number | null;
  /** Video title / name. */
  name: string | null;
  /** Current chart rank. */
  rank: number;
  /** ISO date the video was first added to the chart. */
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
  /** Total view count (string to preserve bigint precision). */
  views: string | null;
  /** Total like count. */
  likes: string | null;
  /** Total comment count. */
  comments: string | null;
  /** Historical rank data points. */
  rankStats: TikTokVideoRankStat[];
  /** Historical view data points. */
  viewStats: TikTokVideoViewStat[];
  /** ISO date of the source snapshot. */
  sourceDate: string;
}

/**
 * Top-level API response for the TikTok video chart endpoint.
 */
export interface TikTokVideoChartResponse {
  obj: { length: number; data: TikTokVideoChartRow[] };
}

/**
 * Validated query parameters for the TikTok video chart endpoint.
 */
export interface TikTokVideoChartParams {
  /** Target chart date (YYYY-MM-DD). Null when `latest` is true. */
  date: string | null;
  /** Whether to return the most recent available snapshot. */
  latest: boolean;
  /** Maximum number of rows to return (1–100). */
  limit: number;
  /** Zero-based row offset for pagination (0–9900). */
  offset: number;
}
