/**
 * @module lib/charts/airplay-tracks/normalize
 *
 * Normalizes a raw database row from the airplay track chart query into a
 * strongly-typed {@link AirplayTrackChartRow}.
 *
 * Responsibilities:
 *   - snake_case → camelCase field mapping
 *   - Coerce PostgreSQL arrays / JSON fields to TypeScript arrays
 *   - Serialize `bigint` values to strings
 *   - Provide safe defaults for nullable collection fields
 */

import { AirplayTrackChartRow, AirplayRankStat } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a value that may be `bigint`, `number`, or `string` to a `string`.
 * Returns `null` when the input is `null` or `undefined`.
 *
 * @param value - Raw database value.
 */
function toBigIntString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Ensures the value is a plain JavaScript array.
 * PostgreSQL drivers may return arrays already parsed; otherwise falls back to
 * an empty array.
 *
 * @param value - Raw field from the database result.
 */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

/**
 * Coerces a raw value to a `number | null`.
 *
 * @param value - Raw database value.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerces a raw value to a `string | null`.
 *
 * @param value - Raw database value.
 */
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Normalizes the `rank_stats` JSON column into a typed array of
 * {@link AirplayRankStat}.
 *
 * @param value - Parsed JSON value from the database.
 */
function normalizeRankStats(value: unknown): AirplayRankStat[] {
  const arr = Array.isArray(value) ? value : [];
  return arr.map((item: any) => ({
    rank: Number(item.rank),
    plays: item.plays != null ? String(item.plays) : null,
    timestp: String(item.timestp),
  }));
}

// ---------------------------------------------------------------------------
// Public normalizer
// ---------------------------------------------------------------------------

/**
 * Maps a single raw database row (snake_case) to a typed
 * {@link AirplayTrackChartRow} (camelCase).
 *
 * `bigint` columns (`plays`, `count`, `weekly_count`) are serialized to
 * strings so they remain safe across JSON boundaries.
 *
 * @param row - Untyped database result row.
 * @returns Fully typed and normalized chart row.
 */
export function normalizeAirplayTrackChartRow(row: any): AirplayTrackChartRow {
  return {
    // ── Core track fields ────────────────────────────────────────────────
    trackId: Number(row.track_id),
    name: toStringOrNull(row.name),
    isrc: toStringOrNull(row.isrc),
    imageUrl: toStringOrNull(row.image_url),
    description: toStringOrNull(row.description),
    tags: toArray<string>(row.tags),

    // ── Artist ───────────────────────────────────────────────────────────
    artistIds: toArray<number>(row.artist_ids).map(Number),
    artistNames: toArray<string>(row.artist_names),
    artistCode2s: toArray<string | null>(row.artist_code2s),
    artistImages: toArray<string | null>(row.artist_images),

    // ── Spotify ──────────────────────────────────────────────────────────
    spotifyTrackIds: toArray<string>(row.spotify_track_ids),
    spotifyAlbumIds: toArray<string>(row.spotify_album_ids),
    spotifyDurationMs: toNumberOrNull(row.spotify_duration_ms),

    // ── iTunes ───────────────────────────────────────────────────────────
    itunesTrackIds: toArray<string>(row.itunes_track_ids),
    itunesAlbumIds: toArray<string>(row.itunes_album_ids),
    itunesArtistIds: toArray<string>(row.itunes_artist_ids),
    itunesArtistNames: toArray<string>(row.itunes_artist_names),
    storefronts: toArray<string>(row.storefronts),

    // ── Deezer ───────────────────────────────────────────────────────────
    deezerTrackIds: toArray<string>(row.deezer_track_ids),
    deezerAlbumIds: toArray<string>(row.deezer_album_ids),
    deezerDuration: toNumberOrNull(row.deezer_duration),

    // ── Amazon ───────────────────────────────────────────────────────────
    amazonTrackIds: toArray<string>(row.amazon_track_ids),
    amazonAlbumIds: toArray<string>(row.amazon_album_ids),

    // ── Album / release ──────────────────────────────────────────────────
    albumIds: toArray<number>(row.album_ids).map(Number),
    albumNames: toArray<string>(row.album_names),
    albumUpc: toArray<string | null>(row.album_upc),
    albumLabel: toArray<string | null>(row.album_label),
    releaseDates: toArray<string | null>(row.release_dates),

    // ── Chart position ───────────────────────────────────────────────────
    rank: Number(row.rank),
    preRank: toNumberOrNull(row.pre_rank),
    peakRank: toNumberOrNull(row.peak_rank),
    peakDate: toStringOrNull(row.peak_date),
    addedAt: toStringOrNull(row.added_at),
    velocity: toNumberOrNull(row.velocity),
    timeOnChart: toNumberOrNull(row.time_on_chart),

    // ── Geography ────────────────────────────────────────────────────────
    code2: String(row.code2 ?? 'GLOBAL'),
    cityId: toNumberOrNull(row.city_id),

    // ── Airplay metrics ──────────────────────────────────────────────────
    plays: toBigIntString(row.plays),
    count: toBigIntString(row.count),
    weeklyCount: toBigIntString(row.weekly_count),

    // ── Rank stats ───────────────────────────────────────────────────────
    rankStats: normalizeRankStats(row.rank_stats),
  };
}
