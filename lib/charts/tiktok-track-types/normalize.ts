/**
 * TikTok Typed Track Chart – row normalisation.
 * @module lib/charts/tiktok-track-types/normalize
 */

import {
  TikTokTypedTrackAlbumRef,
  TikTokTypedTrackArtistRef,
  TikTokTypedTrackChartRow,
  TikTokTypedTrackTargetExtras,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a bigint, number, or null/undefined to its string representation.
 * Returns `null` when the value is absent.
 */
function bigToStr(v: bigint | string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Converts a bigint or number to a JS `number`.
 * Returns `null` when the value is absent.
 */
function toNum(v: bigint | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Normalises a Date object or ISO string to a `YYYY-MM-DD` string.
 * Returns the input string sliced if it is already a string.
 */
function toDate(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/**
 * Parses a JSON string representing a list of artist refs.
 * Returns an empty array on failure.
 */
function parseArtists(raw: string | null | undefined): TikTokTypedTrackArtistRef[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      artistId: Number(item.artistId),
      name: String(item.name ?? ''),
      code2: item.code2 ?? null,
      imageUrl: item.imageUrl ?? null,
      careerStage: item.careerStage ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Parses a JSON string representing an album ref object.
 * Returns `null` on failure or when the value is absent.
 */
function parseAlbum(raw: string | null | undefined): TikTokTypedTrackAlbumRef | null {
  if (!raw) return null;
  try {
    const item = JSON.parse(raw);
    if (!item || typeof item !== 'object') return null;
    return {
      albumId: Number(item.albumId),
      name: String(item.name ?? ''),
      label: item.label ?? null,
      releaseDate: toDate(item.releaseDate),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms an array of raw database rows into typed
 * {@link TikTokTypedTrackChartRow} objects suitable for API serialisation.
 *
 * @param rows - Raw rows returned by {@link queryTikTokTypedTrackChart}.
 * @returns Normalised chart rows.
 */
export function normalizeTikTokTypedTrackChartRows(
  rows: any[],
): TikTokTypedTrackChartRow[] {
  return rows.map((row) => {
    const targetExtras: TikTokTypedTrackTargetExtras = {
      airplayStreams: bigToStr(row.airplay_streams),
      spotifyPlays: bigToStr(row.spotify_plays),
      shazamCount: bigToStr(row.shazam_count),
      tiktokTopVideosViews: bigToStr(row.tiktok_top_videos_views),
    };

    return {
      trackId: toNum(row.track_id) as number,
      externalTikTokTrackId: row.external_tiktok_track_id ?? null,
      name: row.name ?? null,
      rank: Number(row.rank),
      chartedDate: String(row.charted_date).slice(0, 10),
      country: row.country ?? null,
      imageUrl: row.image_url ?? null,
      rankDiff: row.rank_diff !== null && row.rank_diff !== undefined ? Number(row.rank_diff) : null,
      artists: parseArtists(row.artists_json),
      album: parseAlbum(row.album_json),
      externalId: row.external_id ?? null,
      targetExtras,
      genre: row.genre ?? null,
      isChartGenre: row.is_chart_genre !== null && row.is_chart_genre !== undefined
        ? Boolean(row.is_chart_genre)
        : null,
    };
  });
}
