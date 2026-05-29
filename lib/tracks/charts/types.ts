/**
 * Exhaustive list of supported chart type identifiers.
 * Used as a discriminant for chart-appearance queries and API routing.
 */
export const CHART_TYPES = [
  'spotify_viral_daily',
  'spotify_viral_weekly',
  'spotify_top_daily',
  'spotify_top_weekly',
  'applemusic_top',
  'applemusic_daily',
  'applemusic_albums',
  'itunes_top',
  'itunes_albums',
  'airplay_daily',
  'airplay_weekly',
  'amazon_top',
  'amazon_daily',
  'shazam_top',
  'shazam_daily',
  'beatport_top',
  'beatport_hype',
  'soundcloud_top',
  'soundcloud_viral',
] as const;

/** Union type of all valid chart type identifiers. */
export type ChartType = typeof CHART_TYPES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Reference sub-shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal artist reference embedded in a chart appearance row. */
export interface ChartArtistRef {
  /** Internal artist ID. */
  id: number;
  /** Display name of the artist. */
  name: string;
  /** URL to the artist's profile image, or `null` if unavailable. */
  imageUrl: string | null;
  /** ISO 3166-1 alpha-2 country code of the artist's origin, or `null`. */
  code2: string | null;
}

/** Minimal album reference embedded in a chart appearance row. */
export interface ChartAlbumRef {
  /** Internal album ID. */
  id: number;
  /** Album title. */
  name: string;
  /** Universal Product Code, or `null`. */
  upc: string | null;
  /** ISO date string of the album release, or `null`. */
  releaseDate: string | null;
  /** Label that released the album, or `null`. */
  label: string | null;
  /** URL to the album artwork, or `null`. */
  imageUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main row shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single normalised chart-appearance row returned by the API.
 * Each row represents one snapshot of a track on a specific chart.
 */
export interface ChartAppearanceRow {
  /** Chart position on this snapshot date, or `null` if unranked. */
  rank: number | null;
  /** ISO date string when the track first appeared on this chart. */
  addedAt: string | null;
  /** ISO 3166-1 alpha-2 territory code for the chart, or `null` for global charts. */
  code2: string | null;
  /** Play count for this snapshot as a string (may be a large integer). */
  plays: string | null;
  /** Track duration in seconds, or `null`. */
  duration: number | null;
  /** The chart type identifier (e.g. `"spotify_top_daily"`). */
  chartType: string;
  /** Rank in the previous snapshot, or `null`. */
  preRank: number | null;
  /** All-time peak rank on this chart, or `null`. */
  peakRank: number | null;
  /** ISO date string of the peak-rank snapshot, or `null`. */
  peakDate: string | null;
  /** Play count at the peak-rank snapshot as a string, or `null`. */
  peakPlays: string | null;
  /** Cumulative play count across all chart appearances as a string, or `null`. */
  totalPlays: string | null;
  /** Internal track ID. */
  trackId: number;
  /** Track title. */
  trackName: string;
  /** International Standard Recording Code, or `null`. */
  isrc: string | null;
  /** URL to the track's cover image, or `null`. */
  trackImageUrl: string | null;
  /** Artists credited on the track. */
  artists: ChartArtistRef[];
  /** Primary album the track belongs to, or `null`. */
  album: ChartAlbumRef | null;
  /** Map of platform name to array of platform-specific IDs for this track. */
  externalIds: Record<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// API response envelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level response shape for the track chart-appearances endpoint.
 */
export interface TrackChartsResponse {
  obj: {
    /** Array of chart-appearance rows ordered by snapshot date ascending. */
    data: ChartAppearanceRow[];
    /** Total number of rows in the result set. */
    length: number;
  };
}
