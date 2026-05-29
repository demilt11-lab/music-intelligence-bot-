/**
 * Version / cluster filter helpers for the Playlist Tracks module.
 *
 * Applies `versionOnly`, `versionAnd`, `versionOr`, and `versionNot` constraints
 * to a Prisma-compatible `where` clause object.
 *
 * The filters operate on `track_versions.version_id` via subquery existence checks.
 * Each filter mode maps to standard SQL / Prisma semantics:
 *
 * - `versionOnly`  – track must have exactly these versions and no others.
 * - `versionAnd`   – track must have ALL listed versions (AND-EXISTS per ID).
 * - `versionOr`    – track must have AT LEAST ONE of the listed versions.
 * - `versionNot`   – track must have NONE of the listed versions.
 */

import type { PlaylistTracksParams } from './types';

/**
 * Merges version-cluster filter conditions into a raw SQL WHERE-clause fragment.
 *
 * The returned object follows Prisma `$queryRawUnsafe` convention: it returns a
 * supplementary SQL string and the additional positional bind values so the
 * query layer can splice them into its main WHERE clause.
 *
 * @param params - Validated playlist-tracks params containing version arrays.
 * @param existingConditions - Mutable array of SQL condition strings to append to.
 * @param existingValues - Mutable array of bind values to append to.
 * @param startIdx - The next available positional parameter index (1-based).
 * @returns The updated `startIdx` after consuming parameters for version filters.
 */
export function applyVersionFilters(
  params: PlaylistTracksParams,
  existingConditions: string[],
  existingValues: unknown[],
  startIdx: number,
): number {
  let idx = startIdx;

  const addParam = (value: unknown): string => {
    existingValues.push(value);
    return `$${idx++}`;
  };

  const { versionOnly, versionAnd, versionOr, versionNot } = params;

  // version_only: track must belong to exactly this set of versions
  if (versionOnly.length > 0) {
    // All listed versions must exist
    for (const v of versionOnly) {
      existingConditions.push(
        `EXISTS (
          SELECT 1 FROM track_versions tv
          WHERE tv.track_id = t.id AND tv.version_id = ${addParam(v)}
        )`,
      );
    }
    // No version outside the listed set may exist
    const notInPlaceholders = versionOnly.map((v) => addParam(v)).join(', ');
    existingConditions.push(
      `NOT EXISTS (
        SELECT 1 FROM track_versions tv
        WHERE tv.track_id = t.id AND tv.version_id NOT IN (${notInPlaceholders})
      )`,
    );
  }

  // version_and: all listed versions must be present (versionOr check prevents combining)
  if (versionAnd.length > 0) {
    for (const v of versionAnd) {
      existingConditions.push(
        `EXISTS (
          SELECT 1 FROM track_versions tv
          WHERE tv.track_id = t.id AND tv.version_id = ${addParam(v)}
        )`,
      );
    }
  }

  // version_or: at least one of the listed versions must be present
  if (versionOr.length > 0) {
    const placeholders = versionOr.map((v) => addParam(v)).join(', ');
    existingConditions.push(
      `EXISTS (
        SELECT 1 FROM track_versions tv
        WHERE tv.track_id = t.id AND tv.version_id IN (${placeholders})
      )`,
    );
  }

  // version_not: none of the listed versions may be present
  if (versionNot.length > 0) {
    const placeholders = versionNot.map((v) => addParam(v)).join(', ');
    existingConditions.push(
      `NOT EXISTS (
        SELECT 1 FROM track_versions tv
        WHERE tv.track_id = t.id AND tv.version_id IN (${placeholders})
      )`,
    );
  }

  return idx;
}
