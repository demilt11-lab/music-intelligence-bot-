import { badRequest } from '@/lib/shared/errors';
import { dateRangeDefaults } from '@/lib/shared/dates';
import { parseBoolean, parseEnum, parseOptionalEnum } from '@/lib/shared/validation';
import {
  TRACK_STAT_PLATFORM_MODES,
  TrackStatMode,
  TrackPlatformStatsParams,
  PLATFORM_STAT_TYPES,
} from './types';

/** Allowed values for the `extrapolated` query parameter. */
const EXTRAPOLATED_VALUES = ['before', 'after', 'both'] as const;
type ExtrapolatedValue = typeof EXTRAPOLATED_VALUES[number];

/**
 * Validates and resolves all query parameters for the track platform-stats
 * endpoint.
 *
 * Rules:
 * - `id` must be a positive integer (or a domain ID string when `isDomainId`
 *   is set to `true`).
 * - `platform` must be one of the keys in {@link PLATFORM_STAT_TYPES}.
 * - `mode` must be one of {@link TRACK_STAT_PLATFORM_MODES}.
 * - `type` must be one of the stat types supported by the given `platform`.
 * - `since` defaults to 180 days ago; `until` defaults to today.
 * - `latest`, `interpolated`, `isDomainId` are boolean flags (default `false`).
 * - `extrapolated` is optional; allowed values: `"before"`, `"after"`, `"both"`.
 *
 * @param id          - Raw `id` path segment (internal track ID or domain ID).
 * @param platform    - Raw `platform` path segment.
 * @param mode        - Raw `mode` path segment.
 * @param searchParams - Incoming URL search parameters.
 * @returns Fully resolved {@link TrackPlatformStatsParams}.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validatePlatformStatsParams(
  id: string,
  platform: string,
  mode: string,
  searchParams: URLSearchParams,
): TrackPlatformStatsParams {
  // ── isDomainId flag ──────────────────────────────────────────────────────
  const isDomainId = parseBoolean(searchParams.get('isDomainId'), false);

  // ── trackId ──────────────────────────────────────────────────────────────
  let trackId: number;
  if (isDomainId) {
    // Domain IDs are opaque strings; we do not validate them as integers here.
    // The service layer is responsible for resolving them to a canonical ID.
    // We still need a numeric placeholder — use 0 as sentinel.
    trackId = 0;
  } else {
    const parsed = parseInt(id, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw badRequest(
        `"id" must be a positive integer; received "${id}". Pass isDomainId=true to use a platform domain ID.`,
      );
    }
    trackId = parsed;
  }

  // ── platform ──────────────────────────────────────────────────────────────
  const supportedPlatforms = Object.keys(PLATFORM_STAT_TYPES);
  if (!supportedPlatforms.includes(platform)) {
    throw badRequest(
      `Invalid "platform": "${platform}". Supported platforms: ${supportedPlatforms.join(', ')}.`,
    );
  }

  // ── mode ──────────────────────────────────────────────────────────────────
  const resolvedMode = parseEnum(
    mode,
    TRACK_STAT_PLATFORM_MODES,
    'mode',
  );

  // ── type ──────────────────────────────────────────────────────────────────
  const typeRaw = searchParams.get('type');
  const allowedTypes = PLATFORM_STAT_TYPES[platform];
  let resolvedType: string;
  if (!typeRaw || typeRaw.trim() === '') {
    // Default to the first allowed type for the platform
    resolvedType = allowedTypes[0];
  } else {
    if (!(allowedTypes as readonly string[]).includes(typeRaw.trim())) {
      throw badRequest(
        `Invalid "type" for platform "${platform}": "${typeRaw}". Allowed: ${allowedTypes.join(', ')}.`,
      );
    }
    resolvedType = typeRaw.trim();
  }

  // ── date range ────────────────────────────────────────────────────────────
  const sinceRaw = searchParams.get('since') ?? undefined;
  const untilRaw = searchParams.get('until') ?? undefined;
  const { since, until } = dateRangeDefaults(sinceRaw, untilRaw, 180);

  // ── boolean flags ─────────────────────────────────────────────────────────
  const latest       = parseBoolean(searchParams.get('latest'),       false);
  const interpolated = parseBoolean(searchParams.get('interpolated'), false);

  // ── extrapolated ──────────────────────────────────────────────────────────
  const extrapolated = parseOptionalEnum<ExtrapolatedValue>(
    searchParams.get('extrapolated'),
    EXTRAPOLATED_VALUES,
  ) as 'before' | 'after' | 'both' | undefined;

  return {
    trackId,
    platform,
    mode: resolvedMode as TrackStatMode,
    since,
    until,
    type: resolvedType,
    latest,
    interpolated,
    isDomainId,
    extrapolated,
  };
}
