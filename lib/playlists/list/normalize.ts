/**
 * Row normalization for Playlist Directory results.
 * Converts raw database rows into typed {@link PlaylistDirectoryRow} objects.
 */

import type { PlaylistDirectoryRow, PlaylistTag } from './types';

/**
 * Coerces a raw database value to a string or null.
 */
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Coerces a raw database value to a number or null.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/**
 * Coerces a raw database value to a boolean or null.
 */
function toBooleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/**
 * Parses the `tags` column, which may arrive as a JSON string, a parsed array,
 * or an already-structured array of tag objects.
 */
function parseTags(raw: unknown): PlaylistTag[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      id: Number(item['id']),
      name: String(item['name'] ?? ''),
    }));
}

/**
 * Normalizes a single raw database row into a {@link PlaylistDirectoryRow}.
 *
 * @param row - A raw row object returned from the database query.
 * @param position - The 1-based display position in the result set.
 * @returns A fully-typed {@link PlaylistDirectoryRow}.
 */
export function normalizePlaylistDirectoryRow(row: any, position: number): PlaylistDirectoryRow {
  return {
    position,
    playlistId: Number(row.playlistId ?? row.id ?? 0),
    externalPlaylistId: toStringOrNull(row.externalPlaylistId ?? row.external_playlist_id),
    code2: toStringOrNull(row.code2),
    name: toStringOrNull(row.name),
    imageUrl: toStringOrNull(row.imageUrl ?? row.image_url),
    personalized: toBooleanOrNull(row.personalized),
    lastUpdated: toStringOrNull(row.lastUpdated ?? row.last_updated),
    ownerName: toStringOrNull(row.ownerName ?? row.owner_name),
    ownerId: toNumberOrNull(row.ownerId ?? row.owner_id),
    externalUserId: toStringOrNull(row.externalUserId ?? row.external_user_id),
    editorial: toBooleanOrNull(row.editorial),
    topPlaylist: toBooleanOrNull(row.topPlaylist ?? row.top_playlist),
    followers: toStringOrNull(row.followers),
    views: toStringOrNull(row.views),
    latest: toBooleanOrNull(row.latest),
    numTrack: toNumberOrNull(row.numTrack ?? row.num_track),
    followerDiffWeek: toStringOrNull(row.followerDiffWeek ?? row.follower_diff_week),
    followerDiffPercentWeek: toNumberOrNull(
      row.followerDiffPercentWeek ?? row.follower_diff_percent_week,
    ),
    followerDiffMonth: toStringOrNull(row.followerDiffMonth ?? row.follower_diff_month),
    followerDiffPercentMonth: toNumberOrNull(
      row.followerDiffPercentMonth ?? row.follower_diff_percent_month,
    ),
    viewDiffWeek: toStringOrNull(row.viewDiffWeek ?? row.view_diff_week),
    viewDiffMonth: toStringOrNull(row.viewDiffMonth ?? row.view_diff_month),
    monthlyDiff: toStringOrNull(row.monthlyDiff ?? row.monthly_diff),
    catalog: toNumberOrNull(row.catalog),
    activeRatio: toNumberOrNull(row.activeRatio ?? row.active_ratio),
    genre: toStringOrNull(row.genre),
    tags: parseTags(row.tags),
    rank: toNumberOrNull(row.rank),
  };
}
