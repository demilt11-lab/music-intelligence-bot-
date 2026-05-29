/**
 * Per-platform configuration for curator playlist queries.
 * @module lib/curators/playlists/platform-config
 */

import type { CuratorPlaylistPlatform } from './types';

/**
 * Sort configuration for a single curator playlist platform.
 */
export interface CuratorPlaylistPlatformConfig {
  /** Column used when no explicit sort is provided. */
  defaultSort: string;
  /** Exhaustive set of columns the caller may sort by. */
  allowedSorts: readonly string[];
}

/**
 * Platform-specific query configuration for the curator playlists endpoint.
 */
export const CURATOR_PLAYLIST_PLATFORM_CONFIGS: Record<
  CuratorPlaylistPlatform,
  CuratorPlaylistPlatformConfig
> = {
  spotify: {
    defaultSort: 'followers',
    allowedSorts: ['last_updated', 'followers', 'num_track'],
  },
  applemusic: {
    defaultSort: 'last_updated',
    allowedSorts: ['last_updated', 'num_track'],
  },
  deezer: {
    defaultSort: 'last_updated',
    allowedSorts: ['last_updated', 'followers', 'num_track'],
  },
};

/**
 * Returns the platform configuration for the given curator playlist platform.
 *
 * @param platform - A valid {@link CuratorPlaylistPlatform} value.
 * @returns The corresponding {@link CuratorPlaylistPlatformConfig}.
 */
export function getCuratorPlaylistPlatformConfig(
  platform: CuratorPlaylistPlatform,
): CuratorPlaylistPlatformConfig {
  return CURATOR_PLAYLIST_PLATFORM_CONFIGS[platform];
}
