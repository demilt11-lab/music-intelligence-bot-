/**
 * Every platform recognised by the Music Intelligence API.
 */
export const SUPPORTED_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube',
  'tiktok',
  'soundcloud',
  'deezer',
  'amazon_music',
  'pandora',
  'shazam',
  'audiomack',
] as const;

/** Union of all supported platform identifiers. */
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Platform subsets used by specific data domains
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Platforms that provide per-track daily/weekly streaming statistics.
 */
export const TRACK_STAT_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube',
  'tiktok',
  'soundcloud',
  'deezer',
  'amazon_music',
  'pandora',
  'shazam',
  'audiomack',
] as const satisfies readonly Platform[];

export type TrackStatPlatform = (typeof TRACK_STAT_PLATFORMS)[number];

/**
 * Platforms that expose playlist curator data.
 */
export const CURATOR_PLATFORMS = [
  'spotify',
  'apple_music',
  'deezer',
  'amazon_music',
] as const satisfies readonly Platform[];

export type CuratorPlatform = (typeof CURATOR_PLATFORMS)[number];

/**
 * Platforms that host user-editable playlists tracked by the system.
 */
export const PLAYLIST_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube',
  'deezer',
  'amazon_music',
] as const satisfies readonly Platform[];

export type PlaylistPlatform = (typeof PLAYLIST_PLATFORMS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `true` if `p` is a member of `list`.
 *
 * @param p    - The platform string to test.
 * @param list - The allowed platform list to check against.
 */
export function isValidPlatform(p: string, list: readonly string[]): boolean {
  return list.includes(p);
}
