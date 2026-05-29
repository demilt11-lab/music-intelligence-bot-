/**
 * Curator list – row normalisation.
 * @module lib/curators/list/normalize
 */

import type { CuratorPlatform, CuratorRow } from './types';
import type { RawCuratorRow } from './query';

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a bigint, number, or string value to its string representation.
 * Returns `null` when the value is absent.
 */
function bigToStr(v: bigint | string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Coerces a value to `number | null`, accepting bigint and string inputs.
 */
function toNum(v: bigint | string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Ensures the tags field is always a string array.
 */
function normaliseTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforms a raw database row into a typed {@link CuratorRow} ready for API
 * serialisation.
 *
 * BigInt fields (`totalReach`, `followers`, `followerDiffMonth`) are
 * stringified to avoid JSON serialisation errors.
 *
 * @param row      - Raw row returned by {@link queryCurators}.
 * @param position - 1-based position within the current result page.
 * @param platform - The resolved curator platform.
 * @returns A normalised {@link CuratorRow}.
 */
export function normalizeCuratorRow(
  row: RawCuratorRow,
  position: number,
  platform: CuratorPlatform,
): CuratorRow {
  return {
    position,
    curatorId: row.id,
    platform,
    externalOwnerId: row.externalOwnerId ?? null,
    ownerName: row.ownerName ?? null,
    imageUrl: row.imageUrl ?? null,
    numPlaylists: row.numPlaylists != null ? toNum(row.numPlaylists) : null,
    totalReach: bigToStr(row.totalReach),
    followers: bigToStr(row.followers),
    followerDiffMonth: bigToStr(row.followerDiffMonth),
    followerDiffPercentMonth:
      row.followerDiffPercentMonth != null
        ? toNum(row.followerDiffPercentMonth)
        : null,
    tags: normaliseTags(row.tags),
    numUpdates: row.numUpdates != null ? toNum(row.numUpdates) : null,
    numTracksUpdated:
      row.numTracksUpdated != null ? toNum(row.numTracksUpdated) : null,
    editorial: row.editorial ?? null,
    majorLabel: row.majorLabel ?? null,
    brand: row.brand ?? null,
    popularIndie: row.popularIndie ?? null,
    indie: row.indie ?? null,
    audiobook: row.audiobook ?? null,
  };
}
