/**
 * Types for the Playlist Tracks module.
 */

/** Whether to return current (live) or historical (past) track membership. */
export type PlaylistSpan = 'current' | 'past';

/** How version/cluster filtering should be applied. */
export type VersionFilterMode = 'only' | 'and' | 'or' | 'not';

/** Spotify audio feature values for a track. */
export interface PlaylistTrackAudioFeatures {
  tempo: number | null;
  key: number | null;
  mode: number | null;
  valence: number | null;
  energy: number | null;
  danceability: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  loudness: number | null;
  speechiness: number | null;
  timeSignature: number | null;
}

/** Position and date range for a single instance of a track appearing in the playlist. */
export interface PlaylistTrackPositionStat {
  position: number;
  addedAt: string;
  removedAt: string | null;
}

/** A single track row in the playlist tracks response. */
export interface PlaylistTrackRow {
  trackId: number;
  isrc: string | null;
  addedAt: string | null;
  removedAt: string | null;
  position: number | null;
  period: number | null;
  name: string | null;
  imageUrl: string | null;
  popularity: number | null;
  genre: string | null;
  artistIds: number[];
  artistNames: string[];
  artistCode2s: Array<string | null>;
  artistImages: Array<string | null>;
  albumIds: number[];
  albumNames: string[];
  albumUpc: Array<string | null>;
  albumLabels: Array<string | null>;
  releaseDates: Array<string | null>;
  externalTrackIds: Record<string, string[]>;
  externalAlbumIds: Record<string, string[]>;
  externalArtistIds: Record<string, string[]>;
  durationMs: number | null;
  audioFeatures: PlaylistTrackAudioFeatures | null;
  positionStats: PlaylistTrackPositionStat[];
}

/** Response envelope for the playlist tracks endpoint. */
export interface PlaylistTracksResponse {
  obj: PlaylistTrackRow[];
}

/** Validated parameters for a playlist tracks query. */
export interface PlaylistTracksParams {
  platform: string;
  playlistId: number;
  span: PlaylistSpan;
  /** Whether to include detailed track, artist, album, and audio feature data. */
  withDetails: boolean;
  /** Lower bound on `removed_at` (span=past only). */
  since: string | undefined;
  /** Upper bound on `added_at` (span=past only). */
  until: string | undefined;
  /** Storefront / market filter (Apple Music etc.). */
  storefront: string | undefined;
  /** ISRCs / version identifiers to exclusively return (mutually exclusive with versionAnd/Or/Not). */
  versionOnly: string[];
  /** Versions that must all be present on the track. */
  versionAnd: string[];
  /** At least one of these versions must be present. */
  versionOr: string[];
  /** Tracks having these versions are excluded. */
  versionNot: string[];
  limit: number;
  offset: number;
}
