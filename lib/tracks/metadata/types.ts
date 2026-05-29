/**
 * An artist credited on a track.
 */
export interface TrackArtist {
  id: number;
  name: string;
  imageUrl: string | null;
  /** ISO 3166-1 alpha-2 country code for the artist's origin country. */
  code2: string | null;
}

/**
 * An album that contains the track.
 */
export interface TrackAlbum {
  id: number;
  name: string;
  /** Universal Product Code. */
  upc: string | null;
  /** ISO 8601 date string (YYYY-MM-DD). */
  releaseDate: string | null;
  /** Record label associated with the album. */
  label: string | null;
  imageUrl: string | null;
  /** Popularity score (0–100) from the primary streaming platform. */
  popularity: number | null;
}

/**
 * Aggregated cross-platform statistics for a track.
 *
 * All high-cardinality counters are serialised as strings to avoid JavaScript
 * bigint precision loss during JSON serialisation.
 */
export interface TrackStatistics {
  spotifyPopularity: number | null;
  /** Total Spotify stream count as a decimal string. */
  spotifyStreams: string | null;
  /** TikTok video count as a decimal string. */
  tiktokVideoCount: string | null;
  /** Genius page-view count as a decimal string. */
  geniusPageViews: string | null;
  /** YouTube view count as a decimal string. */
  youtubeViews: string | null;
  /** Shazam recognition count as a decimal string. */
  shazamCount: string | null;
  /** Pandora stream count as a decimal string. */
  pandoraStreams: string | null;
  /** Boomplay stream count as a decimal string. */
  boomplayStreams: string | null;
}

/**
 * Full metadata for a single track.
 */
export interface TrackMetadata {
  id: number;
  name: string;
  /** International Standard Recording Code. */
  isrc: string | null;
  imageUrl: string | null;
  /** URL to a 30-second audio preview clip. */
  previewUrl: string | null;
  /** Track duration in milliseconds. */
  durationMs: number | null;
  /** Primary composer name string. */
  composerName: string | null;
  /** Internal tier classification for the track. */
  trackTier: string | null;
  /** Primary and featured artists. */
  artists: TrackArtist[];
  /** Albums this track appears on. */
  albums: TrackAlbum[];
  /** Editorial/genre tag strings. */
  tags: string[];
  /** Mood descriptors. */
  moods: string[];
  /** Activity/context descriptors. */
  activities: string[];
  /** Genre strings. */
  genres: string[];
  /** Songwriter / lyricist names. */
  songwriters: string[];
  /** ISO 8601 date string (YYYY-MM-DD). */
  releaseDate: string | null;
  /** Primary album label. */
  albumLabel: string | null;
  /** Whether the track carries an explicit-content flag. */
  explicit: boolean | null;
  /** Overall popularity / relevance score. */
  score: number | null;
  statistics: TrackStatistics;
}

/**
 * Response envelope for the track metadata endpoint.
 */
export interface TrackMetadataResponse {
  obj: TrackMetadata;
}
