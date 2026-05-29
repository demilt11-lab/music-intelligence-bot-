/**
 * YouTube Shorts Chart – shared type definitions.
 * @module lib/charts/youtube-shorts/types
 */

/** Chart granularity for the YouTube Shorts chart. */
export type YouTubeShortsChartType = 'shorts_daily' | 'shorts_weekly';

/**
 * A slim artist reference attached to a chart row.
 */
export interface YouTubeShortsArtistRef {
  /** Internal artist ID. */
  artistId: number;
  /** Artist display name. */
  name: string;
  /** ISO alpha-2 country code associated with the artist. */
  code2: string | null;
  /** Artist profile image URL. */
  imageUrl: string | null;
}

/**
 * A slim album reference attached to a chart row.
 */
export interface YouTubeShortsAlbumRef {
  /** Internal album ID. */
  albumId: number;
  /** Album title. */
  name: string;
  /** Record label name. */
  label: string | null;
  /** ISO date string of the album's original release. */
  releaseDate: string | null;
}

/**
 * A single row in the YouTube Shorts chart response.
 */
export interface YouTubeShortsChartRow {
  /** Internal track ID. */
  trackId: number;
  /** External YouTube video/sound ID, if available. */
  externalYouTubeId: string | null;
  /** Track title. */
  name: string | null;
  /** Current chart rank. */
  rank: number;
  /** ISO date this entry appeared on the chart (YYYY-MM-DD). */
  chartedDate: string;
  /** ISO alpha-2 country code for the chart ('GLOBAL' for global charts). */
  country: string;
  /** Track artwork URL. */
  imageUrl: string | null;
  /** Rank change vs. previous snapshot (positive = risen). */
  rankDiff: number | null;
  /** Artists associated with the track. */
  artists: YouTubeShortsArtistRef[];
  /** Primary album for the track. */
  album: YouTubeShortsAlbumRef | null;
  /** ISRC identifier for the track. */
  isrc: string | null;
  /** YouTube-specific metric extras. */
  targetExtras: { youtubeViews: string | null };
  /** Primary genre. */
  genre: string | null;
  /** Whether this genre is the chart's defining genre. */
  isChartGenre: boolean | null;
}

/**
 * Validated query parameters for the YouTube Shorts chart endpoint.
 */
export interface YouTubeShortsChartParams {
  /** Chart granularity ('shorts_daily' | 'shorts_weekly'). */
  chartType: YouTubeShortsChartType;
  /** ISO alpha-2 country code, or 'GLOBAL'. */
  code2: string;
  /** Target chart date (YYYY-MM-DD). Null when `latest` is true. */
  date: string | null;
  /** Whether to return the most recent available snapshot. */
  latest: boolean;
  /** Maximum number of rows to return (1–1000). */
  limit: number;
  /** Zero-based row offset for pagination (>= 0). */
  offset: number;
}
