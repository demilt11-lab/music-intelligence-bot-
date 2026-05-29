/**
 * Per-platform configuration for the Playlist Directory.
 * Defines allowed sort columns and which optional filters each platform supports.
 */

import type { PlaylistPlatform } from './types';

/** Capability and sort configuration for a single playlist platform. */
export interface PlaylistPlatformConfig {
  /** The default sort column when none is specified. */
  defaultSort: string;
  /** Exhaustive list of valid sort column values for this platform. */
  allowedSorts: readonly string[];
  /** Whether the platform supports country-code (code2) filtering. */
  supportsCode2: boolean;
  /** Whether the platform supports curator-id filtering. */
  supportsCuratorIds: boolean;
  /** Whether the platform supports the indie-curator filter. */
  supportsIndie: boolean;
  /** Whether the platform supports the major-curator filter. */
  supportsMajorCurator: boolean;
  /** Whether the platform supports the new-music-friday filter. */
  supportsNewMusicFriday: boolean;
  /** Whether the platform surfaces view counts instead of (or alongside) followers. */
  supportsViews: boolean;
}

/**
 * Static configuration map for every supported playlist platform.
 * All boolean capability fields default to `false` unless explicitly set.
 */
export const PLAYLIST_PLATFORM_CONFIGS: Record<PlaylistPlatform, PlaylistPlatformConfig> = {
  amazon: {
    defaultSort: 'rank',
    allowedSorts: ['active_ratio', 'last_updated', 'num_track', 'rank'],
    supportsCode2: false,
    supportsCuratorIds: false,
    supportsIndie: false,
    supportsMajorCurator: false,
    supportsNewMusicFriday: false,
    supportsViews: false,
  },
  itunes: {
    defaultSort: 'last_updated',
    allowedSorts: ['active_ratio', 'num_track', 'last_updated'],
    supportsCode2: true,
    supportsCuratorIds: true,
    supportsIndie: true,
    supportsMajorCurator: false,
    supportsNewMusicFriday: false,
    supportsViews: false,
  },
  spotify: {
    defaultSort: 'followers',
    allowedSorts: [
      'followers',
      'fdiff_week',
      'fdiff_percent_week',
      'fdiff_month',
      'fdiff_percent_month',
      'active_ratio',
      'last_updated',
      'num_track',
    ],
    supportsCode2: true,
    supportsCuratorIds: true,
    supportsIndie: true,
    supportsMajorCurator: true,
    supportsNewMusicFriday: true,
    supportsViews: false,
  },
  applemusic: {
    defaultSort: 'last_updated',
    allowedSorts: ['active_ratio', 'num_track', 'last_updated'],
    supportsCode2: true,
    supportsCuratorIds: false,
    supportsIndie: false,
    supportsMajorCurator: false,
    supportsNewMusicFriday: false,
    supportsViews: false,
  },
  deezer: {
    defaultSort: 'followers',
    allowedSorts: [
      'followers',
      'fdiff_week',
      'fdiff_percent_week',
      'fdiff_month',
      'fdiff_percent_month',
      'active_ratio',
      'last_updated',
      'num_track',
    ],
    supportsCode2: false,
    supportsCuratorIds: false,
    supportsIndie: false,
    supportsMajorCurator: false,
    supportsNewMusicFriday: false,
    supportsViews: false,
  },
  youtube: {
    defaultSort: 'views',
    allowedSorts: [
      'active_ratio',
      'last_updated',
      'num_track',
      'views',
      'vdiff_week',
      'vdiff_percent_week',
      'vdiff_month',
      'vdiff_percent_month',
    ],
    supportsCode2: false,
    supportsCuratorIds: false,
    supportsIndie: true,
    supportsMajorCurator: false,
    supportsNewMusicFriday: false,
    supportsViews: true,
  },
};

/**
 * Returns the platform configuration for a given platform.
 *
 * @param platform - A valid {@link PlaylistPlatform} key.
 * @returns The corresponding {@link PlaylistPlatformConfig}.
 */
export function getPlaylistPlatformConfig(platform: PlaylistPlatform): PlaylistPlatformConfig {
  return PLAYLIST_PLATFORM_CONFIGS[platform];
}
