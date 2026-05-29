/**
 * Curator playlists – row normalisation.
 * @module lib/curators/playlists/normalize
 */

import type { CuratorPlaylistRow, CuratorPlaylistTag } from './types';
import type { RawCuratorPlaylistRow } from './query';

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a bigint, number, or string to its string representation.
 * Returns `null` when the value is absent.
 */
function bigToStr(v: bigint | string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Converts a value to `number | null`.
 */
function toNum(v: bigint | string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Normalises a Date object or ISO string to a `YYYY-MM-DD` string.
 * Returns `null` when the value is absent.
 */
function toDateStr(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/**
 * Coerces an unknown tags value into a `CuratorPlaylistTag[]`.
 * Handles both pre-resolved arrays (from the query layer) and raw JSON strings.
 */
function normaliseTags(raw: unknown): CuratorPlaylistTag[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .filter((item) => item && typeof item === 'object')
      .map((item: any) => ({
        id: Number(item.id),
        name: String(item.name ?? ''),
      }));
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return normaliseTags(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms a raw database row into a typed {@link CuratorPlaylistRow} ready
 * for API serialisation.
 *
 * BigInt fields (`followers`, `followerDiffWeek`, `followerDiffMonth`) are
 * stringified to avoid JSON serialisation errors.
 *
 * @param row - Raw row returned by {@link queryCuratorPlaylists}.
 * @returns A normalised {@link CuratorPlaylistRow}.
 */
export function normalizeCuratorPlaylistRow(
  row: RawCuratorPlaylistRow,
): CuratorPlaylistRow {
  return {
    playlistId: row.id,
    externalPlaylistId: row.externalPlaylistId ?? null,
    name: row.name ?? null,
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    sysLastUpdated: toDateStr(row.sysLastUpdated),
    lastUpdated: toDateStr(row.lastUpdated),
    personalized: row.personalized ?? null,
    code2: row.code2 ?? null,
    ownerName: row.ownerName ?? null,
    ownerId: row.ownerId != null ? toNum(row.ownerId) : null,
    externalUserId: row.externalUserId ?? null,
    official: row.official ?? null,
    tags: normaliseTags(row.tags),
    followers: bigToStr(row.followers),
    numTrack: row.numTrack != null ? toNum(row.numTrack) : null,
    followerDiffWeek: bigToStr(row.followerDiffWeek),
    followerDiffMonth: bigToStr(row.followerDiffMonth),
    catalog: row.catalog != null ? toNum(row.catalog) : null,
    activeRatio: row.activeRatio != null ? toNum(row.activeRatio) : null,
  };
}
