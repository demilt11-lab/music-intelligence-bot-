/**
 * Row normalisation for Playlist Tracks results.
 * Converts raw database rows into typed {@link PlaylistTrackRow} objects.
 */

import type {
  PlaylistTrackAudioFeatures,
  PlaylistTrackPositionStat,
  PlaylistTrackRow,
} from './types';

/** Coerces a value to number | null. */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Coerces a value to string | null. */
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Safely parses a JSON string or passes through an already-parsed value.
 *
 * @param raw - A JSON string, already-parsed object/array, or null/undefined.
 * @param fallback - Value to return on parse failure or null input.
 */
function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/**
 * Parses the aggregated artists JSON into parallel arrays.
 */
function parseArtists(raw: unknown): {
  artistIds: number[];
  artistNames: string[];
  artistCode2s: Array<string | null>;
  artistImages: Array<string | null>;
} {
  const arr = parseJson<Array<Record<string, unknown>>>(raw, []);
  return {
    artistIds: arr.map((a) => Number(a['id'] ?? 0)),
    artistNames: arr.map((a) => String(a['name'] ?? '')),
    artistCode2s: arr.map((a) => toStringOrNull(a['code2'])),
    artistImages: arr.map((a) => toStringOrNull(a['image'])),
  };
}

/**
 * Parses the aggregated albums JSON into parallel arrays.
 */
function parseAlbums(raw: unknown): {
  albumIds: number[];
  albumNames: string[];
  albumUpc: Array<string | null>;
  albumLabels: Array<string | null>;
  releaseDates: Array<string | null>;
} {
  const arr = parseJson<Array<Record<string, unknown>>>(raw, []);
  return {
    albumIds: arr.map((a) => Number(a['id'] ?? 0)),
    albumNames: arr.map((a) => String(a['name'] ?? '')),
    albumUpc: arr.map((a) => toStringOrNull(a['upc'])),
    albumLabels: arr.map((a) => toStringOrNull(a['label'])),
    releaseDates: arr.map((a) => toStringOrNull(a['release_date'])),
  };
}

/**
 * Parses a platform-keyed external IDs JSON object.
 */
function parseExternalIds(raw: unknown): Record<string, string[]> {
  const obj = parseJson<Record<string, unknown>>(raw, {});
  const result: Record<string, string[]> = {};
  for (const [platform, ids] of Object.entries(obj)) {
    if (Array.isArray(ids)) {
      result[platform] = ids.map(String);
    }
  }
  return result;
}

/**
 * Parses the audio features JSON into a typed object or null.
 */
function parseAudioFeatures(raw: unknown): PlaylistTrackAudioFeatures | null {
  if (!raw) return null;
  const obj = parseJson<Record<string, unknown>>(raw, {});
  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) return null;
  return {
    tempo: toNumberOrNull(obj['tempo']),
    key: toNumberOrNull(obj['key']),
    mode: toNumberOrNull(obj['mode']),
    valence: toNumberOrNull(obj['valence']),
    energy: toNumberOrNull(obj['energy']),
    danceability: toNumberOrNull(obj['danceability']),
    acousticness: toNumberOrNull(obj['acousticness']),
    instrumentalness: toNumberOrNull(obj['instrumentalness']),
    liveness: toNumberOrNull(obj['liveness']),
    loudness: toNumberOrNull(obj['loudness']),
    speechiness: toNumberOrNull(obj['speechiness']),
    timeSignature: toNumberOrNull(obj['time_signature']),
  };
}

/**
 * Parses the position stats JSON array.
 */
function parsePositionStats(raw: unknown): PlaylistTrackPositionStat[] {
  const arr = parseJson<Array<Record<string, unknown>>>(raw, []);
  return arr.map((s) => ({
    position: Number(s['position'] ?? 0),
    addedAt: String(s['addedAt'] ?? ''),
    removedAt: toStringOrNull(s['removedAt']),
  }));
}

/**
 * Normalises a single raw database row into a {@link PlaylistTrackRow}.
 *
 * @param row - Raw row returned by `queryPlaylistTracks`.
 * @returns A fully-typed {@link PlaylistTrackRow}.
 */
export function normalizePlaylistTrack(row: any): PlaylistTrackRow {
  const artists = parseArtists(row['artists_json'] ?? row.artists_json);
  const albums = parseAlbums(row['albums_json'] ?? row.albums_json);

  return {
    trackId: Number(row['trackId'] ?? row.track_id ?? 0),
    isrc: toStringOrNull(row.isrc),
    addedAt: toStringOrNull(row['addedAt'] ?? row.added_at),
    removedAt: toStringOrNull(row['removedAt'] ?? row.removed_at),
    position: toNumberOrNull(row.position),
    period: toNumberOrNull(row.period),
    name: toStringOrNull(row.name),
    imageUrl: toStringOrNull(row['imageUrl'] ?? row.image_url),
    popularity: toNumberOrNull(row.popularity),
    genre: toStringOrNull(row.genre),
    durationMs: toNumberOrNull(row['durationMs'] ?? row.duration_ms),
    ...artists,
    ...albums,
    externalTrackIds: parseExternalIds(row['external_track_ids_json']),
    externalAlbumIds: parseExternalIds(row['external_album_ids_json']),
    externalArtistIds: parseExternalIds(row['external_artist_ids_json']),
    audioFeatures: parseAudioFeatures(row['audio_features_json']),
    positionStats: parsePositionStats(row['position_stats_json']),
  };
}
