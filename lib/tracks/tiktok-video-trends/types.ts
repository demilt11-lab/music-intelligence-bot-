/**
 * A single daily data point for a TikTok video's engagement metrics.
 */
export interface TikTokVideoTrendPoint {
  /** ISO date string for this observation (`YYYY-MM-DD`). */
  timestp: string;
  /** Total number of likes on this date, as a string. */
  likes: string;
  /** Total number of comments on this date, as a string. */
  comments: string;
  /** Total number of views on this date, as a string. */
  views: string;
}

/** Top-level response envelope for the TikTok video trends endpoint. */
export interface TikTokVideoTrendsResponse {
  /** Ordered array of daily trend points, ascending by date. */
  obj: TikTokVideoTrendPoint[];
}

/**
 * Validated parameters for a TikTok video trends query.
 */
export interface TikTokVideoTrendsParams {
  /** Platform-specific TikTok video identifier (non-empty string). */
  videoId: string;
  /**
   * Number of days of history to retrieve, counting back from today.
   * Valid range: 1–365. Defaults to 28.
   */
  fromDaysAgo: number;
}
