/**
 * Per-platform configuration for the platform-stats module.
 *
 * Each entry describes:
 * - `statTypes`          — the stat type identifiers supported by this platform.
 * - `supportsInterp`     — whether linear interpolation is meaningful for this
 *                          platform's data (i.e. the data is continuous/daily).
 * - `columnMap`          — mapping from stat-type identifier to the DB column
 *                          name in `track_platform_stats_daily`.
 */

export interface PlatformConfig {
  /** Supported statistic type identifiers for this platform. */
  statTypes: readonly string[];
  /**
   * Whether the platform emits sufficiently dense data to make interpolation
   * sensible. Platforms with sparse or event-based metrics should set this to
   * `false`.
   */
  supportsInterp: boolean;
  /**
   * Mapping from stat-type identifier (as used in the API) to the exact column
   * name in the `track_platform_stats_daily` table.
   */
  columnMap: Record<string, string>;
}

/**
 * Registry of per-platform configurations, keyed by platform identifier.
 *
 * @example
 * ```ts
 * const cfg = PLATFORM_CONFIGS['spotify'];
 * cfg.statTypes;   // ['streams', 'popularity']
 * cfg.columnMap['streams'];  // 'streams'
 * ```
 */
export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  shazam: {
    statTypes:     ['shazam_count'],
    supportsInterp: true,
    columnMap: {
      shazam_count: 'streams',  // shazam total count stored in `streams` column
    },
  },
  spotify: {
    statTypes:     ['streams', 'popularity'],
    supportsInterp: true,
    columnMap: {
      streams:    'streams',
      popularity: 'saves',      // popularity proxy stored in `saves` column
    },
  },
  youtube: {
    statTypes:     ['video_views', 'channel_views'],
    supportsInterp: true,
    columnMap: {
      video_views:   'video_views',
      channel_views: 'shares',  // channel views stored in `shares` column
    },
  },
  tiktok: {
    statTypes:     ['video_count', 'video_views'],
    supportsInterp: false,
    columnMap: {
      video_count: 'playlist_adds',  // creation count stored in `playlist_adds`
      video_views: 'video_views',
    },
  },
  genius: {
    statTypes:     ['page_views'],
    supportsInterp: true,
    columnMap: {
      page_views: 'streams',  // page views stored in `streams` column
    },
  },
  soundcloud: {
    statTypes:     ['plays', 'likes', 'reposts'],
    supportsInterp: true,
    columnMap: {
      plays:   'streams',
      likes:   'likes',
      reposts: 'shares',
    },
  },
  line: {
    statTypes:     ['plays'],
    supportsInterp: true,
    columnMap: {
      plays: 'streams',
    },
  },
  melon: {
    statTypes:     ['plays'],
    supportsInterp: true,
    columnMap: {
      plays: 'streams',
    },
  },
  radio: {
    statTypes:     ['plays', 'spins'],
    supportsInterp: false,
    columnMap: {
      plays: 'radio_plays',
      spins: 'radio_plays',  // spins and plays both map to `radio_plays`
    },
  },
} as const;

/**
 * Returns the {@link PlatformConfig} for a given platform identifier, or
 * `undefined` when the platform is not supported.
 *
 * @param platform - Platform identifier (e.g. `"spotify"`).
 */
export function getPlatformConfig(platform: string): PlatformConfig | undefined {
  return PLATFORM_CONFIGS[platform];
}

/**
 * Returns the list of supported platforms (sorted alphabetically).
 */
export function getSupportedPlatforms(): string[] {
  return Object.keys(PLATFORM_CONFIGS).sort();
}
