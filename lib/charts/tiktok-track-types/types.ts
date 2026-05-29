/**
 * TikTok Typed Track Chart – shared type definitions.
 * @module lib/charts/tiktok-track-types/types
 */

/** Chart type for the TikTok typed track chart. */
export type TikTokTrackChartType = 'popular' | 'breakout';

/**
 * A slim artist reference attached to a chart row.
 */
export interface TikTokTypedTrackArtistRef {
  /** Internal artist ID. */
  artistId: number;
  /** Artist display name. */
  name: string;
  /** ISO alpha-2 country code associated with the artist. */
  code2: string | null;
  /** Artist profile image URL. */
  imageUrl: string | null;
  /** Career stage label (e.g. 'emerging', 'established'). */
  careerStage: string | null;
}

/**
 * A slim album reference attached to a chart row.
 */
export interface TikTokTypedTrackAlbumRef {
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
 * Cross-platform metric extras for a charting track.
 */
export interface TikTokTypedTrackTargetExtras {
  /** Airplay stream count (string for bigint safety). */
  airplayStreams: string | null;
  /** Spotify play count (string for bigint safety). */
  spotifyPlays: string | null;
  /** Shazam count (string for bigint safety). */
  shazamCount: string | null;
  /** Combined views across the track's top TikTok videos. */
  tiktokTopVideosViews: string | null;
}

/**
 * A single row in the TikTok typed track chart response.
 */
export interface TikTokTypedTrackChartRow {
  /** Internal track ID. */
  trackId: number;
  /** External TikTok music/sound ID, if available. */
  externalTikTokTrackId: string | null;
  /** Track title. */
  name: string | null;
  /** Current chart rank. */
  rank: number;
  /** ISO date this entry appeared on the chart (YYYY-MM-DD). */
  chartedDate: string;
  /** ISO alpha-2 country code for the chart, or null for global. */
  country: string | null;
  /** Track artwork URL. */
  imageUrl: string | null;
  /** Rank change vs. previous snapshot (positive = risen). */
  rankDiff: number | null;
  /** Artists associated with the track. */
  artists: TikTokTypedTrackArtistRef[];
  /** Primary album for the track. */
  album: TikTokTypedTrackAlbumRef | null;
  /** External catalogue ID (e.g. ISRC). */
  externalId: string | null;
  /** Cross-platform metric extras. */
  targetExtras: TikTokTypedTrackTargetExtras;
  /** Primary genre. */
  genre: string | null;
  /** Whether this genre is the chart's defining genre. */
  isChartGenre: boolean | null;
}

/**
 * Validated query parameters for the TikTok typed track chart endpoint.
 */
export interface TikTokTypedTrackChartParams {
  /** Chart type ('popular' | 'breakout'). */
  chartType: TikTokTrackChartType;
  /** Target chart date (YYYY-MM-DD). Null when `latest` is true. */
  date: string | null;
  /** Whether to return the most recent available snapshot. */
  latest: boolean;
  /** Maximum number of rows to return (1–100). */
  limit: number;
  /** Zero-based row offset for pagination (0–9900). */
  offset: number;
  /** Optional ISO alpha-2 country filter. */
  code2: string | undefined;
}
