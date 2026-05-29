/**
 * Supported time-window durations for the airplay track chart.
 */
export type AirplayDuration =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'semi_yearly'
  | 'yearly'
  | 'all_time';

/**
 * A single historical rank-statistics data point for an airplay chart entry.
 */
export interface AirplayRankStat {
  /** Chart rank at this point in time. */
  rank: number;
  /** Airplay play count (string to preserve bigint precision). */
  plays: string | null;
  /** ISO timestamp for this data point. */
  timestp: string;
}

/**
 * A single row in the airplay track chart response.
 */
export interface AirplayTrackChartRow {
  /** Internal track ID. */
  trackId: number;
  /** Track title. */
  name: string | null;
  /** ISRC code. */
  isrc: string | null;
  /** Track artwork URL. */
  imageUrl: string | null;
  /** Optional editorial description. */
  description: string | null;
  /** Genre / mood tags. */
  tags: string[];

  // ── Artist fields ─────────────────────────────────────────────────────────
  /** Internal artist IDs. */
  artistIds: number[];
  /** Artist display names. */
  artistNames: string[];
  /** ISO alpha-2 country codes for each artist. */
  artistCode2s: Array<string | null>;
  /** Artist image URLs. */
  artistImages: Array<string | null>;

  // ── Spotify ───────────────────────────────────────────────────────────────
  /** Spotify track IDs. */
  spotifyTrackIds: string[];
  /** Spotify album IDs. */
  spotifyAlbumIds: string[];
  /** Duration in milliseconds from Spotify metadata. */
  spotifyDurationMs: number | null;

  // ── iTunes ────────────────────────────────────────────────────────────────
  /** iTunes track IDs. */
  itunesTrackIds: string[];
  /** iTunes album IDs. */
  itunesAlbumIds: string[];
  /** iTunes artist IDs. */
  itunesArtistIds: string[];
  /** iTunes artist names (may differ from canonical). */
  itunesArtistNames: string[];
  /** iTunes storefront identifiers. */
  storefronts: string[];

  // ── Deezer ────────────────────────────────────────────────────────────────
  /** Deezer track IDs. */
  deezerTrackIds: string[];
  /** Deezer album IDs. */
  deezerAlbumIds: string[];
  /** Duration in seconds from Deezer metadata. */
  deezerDuration: number | null;

  // ── Amazon ────────────────────────────────────────────────────────────────
  /** Amazon Music track IDs. */
  amazonTrackIds: string[];
  /** Amazon Music album IDs. */
  amazonAlbumIds: string[];

  // ── Album / release ───────────────────────────────────────────────────────
  /** Internal album IDs. */
  albumIds: number[];
  /** Album titles. */
  albumNames: string[];
  /** UPC codes per album. */
  albumUpc: Array<string | null>;
  /** Label names per album. */
  albumLabel: Array<string | null>;
  /** Release dates per album (YYYY-MM-DD). */
  releaseDates: Array<string | null>;

  // ── Chart position ────────────────────────────────────────────────────────
  /** Current chart rank. */
  rank: number;
  /** Rank on the previous snapshot. */
  preRank: number | null;
  /** All-time peak rank on this chart. */
  peakRank: number | null;
  /** ISO date of the peak rank. */
  peakDate: string | null;
  /** ISO date the track first appeared on this chart. */
  addedAt: string | null;
  /** Rank velocity (positive = rising). */
  velocity: number | null;
  /** Number of days on the chart. */
  timeOnChart: number | null;

  // ── Geography ─────────────────────────────────────────────────────────────
  /** ISO alpha-2 country code (or "GLOBAL"). */
  code2: string;
  /** City identifier when the chart is city-scoped. */
  cityId: number | null;

  // ── Airplay metrics ───────────────────────────────────────────────────────
  /** Airplay play count for the snapshot period (string). */
  plays: string | null;
  /** Total spin count for the snapshot period (string). */
  count: string | null;
  /** Weekly spin count (string). */
  weeklyCount: string | null;

  /** Historical rank / play-count data points. */
  rankStats: AirplayRankStat[];
}

/**
 * Top-level API response envelope for the airplay track chart endpoint.
 */
export interface AirplayTrackChartResponse {
  obj: { length: number; data: AirplayTrackChartRow[] };
}

/**
 * Validated query parameters for the airplay track chart endpoint.
 */
export interface AirplayTrackChartParams {
  /** Chart time-window duration. */
  duration: AirplayDuration;
  /** Target snapshot date (YYYY-MM-DD). Null when `latest` is true. */
  date: string | null;
  /** Lower-bound date for date-range queries. */
  since: string | null;
  /** Maximum number of rows to return (1–500). */
  limit: number;
  /** ISO alpha-2 country code or "GLOBAL". */
  countryCode: string;
  /** Optional city scope. */
  cityId: number | undefined;
  /** Whether to return the most recent available snapshot. */
  latest: boolean;
}
