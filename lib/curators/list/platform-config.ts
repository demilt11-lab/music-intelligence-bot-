import type { CuratorPlatform } from './types';

/**
 * Per-platform configuration that governs which sort columns and filter flags
 * are valid when querying curators.
 */
export interface CuratorPlatformConfig {
  /** Column used when no explicit sort is provided. */
  defaultSort: string;
  /** Exhaustive set of columns the caller may sort by. */
  allowedSorts: readonly string[];
  /** Whether the `code2` (ISO country) filter is supported. */
  supportsCode2: boolean;
  /** Whether the `majorLabel` boolean filter is supported. */
  supportsMajorLabel: boolean;
  /** Whether the `brand` boolean filter is supported. */
  supportsBrand: boolean;
  /** Whether the `popularIndie` boolean filter is supported. */
  supportsPopularIndie: boolean;
  /** Whether the `indie` boolean filter is supported. */
  supportsIndie: boolean;
  /** Whether the `withSocialUrls` flag is supported. */
  supportsWithSocialUrls: boolean;
}

/**
 * Platform-specific query configuration for the curator list endpoint.
 */
export const CURATOR_PLATFORM_CONFIGS: Record<
  CuratorPlatform,
  CuratorPlatformConfig
> = {
  spotify: {
    defaultSort: 'num_playlists',
    allowedSorts: [
      'num_playlists',
      'followers',
      'num_updates',
      'num_tracks_updated',
      'fdiff_month',
      'fdiff_percent_month',
      'sp_playlist_total_reach',
    ],
    supportsCode2: false,
    supportsMajorLabel: true,
    supportsBrand: true,
    supportsPopularIndie: true,
    supportsIndie: true,
    supportsWithSocialUrls: true,
  },
  applemusic: {
    defaultSort: 'num_playlists',
    allowedSorts: ['num_playlists'],
    supportsCode2: false,
    supportsMajorLabel: false,
    supportsBrand: false,
    supportsPopularIndie: false,
    supportsIndie: false,
    supportsWithSocialUrls: false,
  },
  itunes: {
    defaultSort: 'num_playlists',
    allowedSorts: ['num_playlists'],
    supportsCode2: false,
    supportsMajorLabel: false,
    supportsBrand: false,
    supportsPopularIndie: false,
    supportsIndie: false,
    supportsWithSocialUrls: false,
  },
  deezer: {
    defaultSort: 'total_reach',
    allowedSorts: ['num_playlists', 'total_reach'],
    supportsCode2: false,
    supportsMajorLabel: false,
    supportsBrand: false,
    supportsPopularIndie: false,
    supportsIndie: false,
    supportsWithSocialUrls: false,
  },
  youtube: {
    defaultSort: 'total_playlist_views',
    allowedSorts: [
      'total_playlist_views',
      'num_playlists',
      'channel_views',
      'channel_subscribers',
    ],
    supportsCode2: true,
    supportsMajorLabel: true,
    supportsBrand: true,
    supportsPopularIndie: true,
    supportsIndie: false,
    supportsWithSocialUrls: false,
  },
  amazon: {
    defaultSort: 'total_playlists',
    allowedSorts: ['total_playlists'],
    supportsCode2: false,
    supportsMajorLabel: false,
    supportsBrand: false,
    supportsPopularIndie: false,
    supportsIndie: false,
    supportsWithSocialUrls: false,
  },
};

/**
 * Returns the platform configuration for the given curator platform.
 *
 * @param platform - A valid {@link CuratorPlatform} value.
 * @returns The corresponding {@link CuratorPlatformConfig}.
 */
export function getCuratorPlatformConfig(
  platform: CuratorPlatform,
): CuratorPlatformConfig {
  return CURATOR_PLATFORM_CONFIGS[platform];
}
