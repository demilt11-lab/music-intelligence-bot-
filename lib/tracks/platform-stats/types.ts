/**
 * Supported query modes for track platform statistics.
 *
 * - `highest-playcounts` — return the platform/track-ID combination with the
 *   highest cumulative playcount within the requested date range.
 * - `most-history`       — return the platform/track-ID combination with the
 *   most data points (longest history) within the requested date range.
 */
export const TRACK_STAT_PLATFORM_MODES = [
  'highest-playcounts',
  'most-history',
] as const;

/** Union type of all valid platform-stat query modes. */
export type TrackStatMode = typeof TRACK_STAT_PLATFORM_MODES[number];

/**
 * Map of platform name to its supported statistic types.
 * Used for validation and documentation.
 */
export const PLATFORM_STAT_TYPES: Record<string, readonly string[]> = {
  shazam:     ['shazam_count'],
  spotify:    ['streams', 'popularity'],
  youtube:    ['video_views', 'channel_views'],
  tiktok:     ['video_count', 'video_views'],
  genius:     ['page_views'],
  soundcloud: ['plays', 'likes', 'reposts'],
  line:       ['plays'],
  melon:      ['plays'],
  radio:      ['plays', 'spins'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Data shapes
// ─────────────────────────────────────────────────────────────────────────────

/** A single time-series data point for a platform statistic. */
export interface StatDataPoint {
  /** ISO date string for this observation (`YYYY-MM-DD`). */
  timestp: string;
  /** Observed value as a string (may represent a large integer). */
  value: string;
}

/**
 * A complete time-series for one platform + track-ID + stat-type combination.
 */
export interface PlatformStatSeries {
  /** Platform identifier (e.g. `"spotify"`, `"tiktok"`). */
  platform: string;
  /** Platform-specific track identifier. */
  platformTrackId: string;
  /** Statistic type identifier (e.g. `"streams"`, `"video_views"`). */
  type: string;
  /** Ordered array of (date, value) data points. */
  data: StatDataPoint[];
}

/** Top-level response envelope for the platform-stats endpoint. */
export interface TrackPlatformStatsResponse {
  /** Array of time-series, one per (platform × track-ID × stat-type) combination. */
  obj: PlatformStatSeries[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validated params
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fully validated and resolved parameters for a platform-stats query.
 */
export interface TrackPlatformStatsParams {
  /** Internal track ID. */
  trackId: number;
  /** Platform to query (e.g. `"spotify"`, `"tiktok"`). */
  platform: string;
  /** Result-selection mode. */
  mode: TrackStatMode;
  /** ISO date string for the start of the query window. */
  since: string;
  /** ISO date string for the end of the query window. */
  until: string;
  /** Statistic type to retrieve (e.g. `"streams"`). */
  type: string;
  /** When `true`, return only the single most-recent row. */
  latest: boolean;
  /** When `true`, fill gaps in the time series by linear interpolation. */
  interpolated: boolean;
  /**
   * When `true`, `id` is treated as a platform-domain identifier rather than
   * the internal track ID; the service will resolve it to a canonical track ID
   * before querying.
   */
  isDomainId: boolean;
  /**
   * Whether to extrapolate values beyond the available data range.
   * - `'before'` — extend backwards from the first known data point.
   * - `'after'`  — extend forwards from the last known data point.
   * - `'both'`   — extend in both directions.
   * - `undefined` — no extrapolation.
   */
  extrapolated: 'before' | 'after' | 'both' | undefined;
}
