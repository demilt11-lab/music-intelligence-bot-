import {
  ChartAppearanceRow,
  ChartArtistRef,
  ChartAlbumRef,
} from './types'
import { RawChartRow } from './query'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely converts a bigint, number, or null to its string representation.
 * Returns `null` when the value is `null` or `undefined`.
 */
function bigToString(v: bigint | string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

/**
 * Safely converts a bigint or number to a JS number.
 * Returns `null` when the value is `null` or `undefined`.
 */
function toNumber(v: bigint | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return Number(v)
}

/**
 * Converts a Date, ISO string, or null to an ISO date string (`YYYY-MM-DD`).
 * Returns `null` when the input is `null` or `undefined`.
 */
function toIsoString(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.slice(0, 10)
  return v.toISOString().slice(0, 10)
}

/**
 * Parses a JSON string that encodes an array of artist objects. Returns an
 * empty array when the string is null, undefined, or malformed.
 */
function parseArtistsJson(raw: string | null | undefined): ChartArtistRef[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Array<{
      id: number
      name: string
      imageUrl: string | null
      code2: string | null
    }>

    if (!Array.isArray(parsed)) return []

    return parsed.map((a) => ({
      id: Number(a.id),
      name: a.name ?? '',
      imageUrl: a.imageUrl ?? null,
      code2: a.code2 ?? null,
    }))
  } catch {
    return []
  }
}

/**
 * Parses a JSON string that encodes a map of `{ platform: externalId }`.
 * Returns a `Record<string, string[]>` with each value wrapped in an array
 * to satisfy the response contract. Returns `{}` on failure.
 */
function parseExternalIdsJson(
  raw: string | null | undefined,
): Record<string, string[]> {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, string | string[]>
    const result: Record<string, string[]> = {}

    for (const [platform, id] of Object.entries(parsed)) {
      result[platform] = Array.isArray(id) ? id : [id]
    }

    return result
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms a raw database row from the chart-appearances query into a
 * fully typed {@link ChartAppearanceRow} suitable for API serialisation.
 *
 * @param row - A raw row returned by {@link queryTrackChartAppearances}.
 * @returns Normalised {@link ChartAppearanceRow}.
 */
export function normalizeChartRow(row: RawChartRow): ChartAppearanceRow {
  const album: ChartAlbumRef | null =
    row.album_id !== null && row.album_id !== undefined
      ? {
          id: toNumber(row.album_id as bigint | number) as number,
          name: row.album_name ?? '',
          upc: row.album_upc ?? null,
          releaseDate: toIsoString(row.album_release_date),
          label: row.album_label ?? null,
          imageUrl: row.album_image_url ?? null,
        }
      : null

  return {
    rank: row.rank ?? null,
    addedAt: toIsoString(row.added_at),
    code2: row.code2 ?? null,
    plays: bigToString(row.plays),
    duration: row.duration ?? null,
    chartType: row.chart_type,
    preRank: row.pre_rank ?? null,
    peakRank: row.peak_rank ?? null,
    peakDate: toIsoString(row.peak_date),
    peakPlays: bigToString(row.peak_plays),
    totalPlays: bigToString(row.total_plays),
    trackId: toNumber(row.track_id as bigint | number) as number,
    trackName: row.track_name,
    isrc: row.isrc ?? null,
    trackImageUrl: row.track_image_url ?? null,
    artists: parseArtistsJson(row.artists_json),
    album,
    externalIds: parseExternalIdsJson(row.external_ids_json),
  }
}
