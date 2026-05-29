/**
 * Curator playlists – parameter validation.
 * @module lib/curators/playlists/validate
 */

import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseOptionalIsoAlpha2,
} from '@/lib/shared/validation';
import { getCuratorPlaylistPlatformConfig } from './platform-config';
import {
  CURATOR_PLAYLIST_PLATFORMS,
  type CuratorPlaylistPlatform,
  type CuratorPlaylistsParams,
} from './types';

/**
 * Validates and coerces all parameters for
 * `GET /api/curators/:platform/:curatorId/playlists`.
 *
 * Validation rules:
 * - `platform`      – must be one of {@link CURATOR_PLAYLIST_PLATFORMS}.
 * - `curatorId`     – must be a positive integer.
 * - `offset`        – integer >= 0, default 0.
 * - `limit`         – integer 1–10 000, default 50.
 * - `offset + limit`– must not exceed 10 000.
 * - `sortColumn`    – must be in the platform's `allowedSorts`; falls back to
 *                     `defaultSort`.
 * - `sortOrderDesc` – boolean, default true.
 * - `storefront`    – optional ISO alpha-2 country code (Apple Music only).
 *
 * @param platform     - The raw `:platform` path segment.
 * @param curatorId    - The raw `:curatorId` path segment.
 * @param searchParams - Parsed URL search parameters.
 * @returns Validated {@link CuratorPlaylistsParams}.
 * @throws {@link ApiError} with status 400 on invalid input.
 */
export function validateCuratorPlaylistsParams(
  platform: string,
  curatorId: string,
  searchParams: URLSearchParams,
): CuratorPlaylistsParams {
  // ── Platform ──────────────────────────────────────────────────────────────
  const validatedPlatform = parseEnum<CuratorPlaylistPlatform>(
    platform,
    CURATOR_PLAYLIST_PLATFORMS,
    'platform',
  );

  const config = getCuratorPlaylistPlatformConfig(validatedPlatform);

  // ── Curator ID ────────────────────────────────────────────────────────────
  const parsedCuratorId = parseInt(curatorId, 10);
  if (isNaN(parsedCuratorId) || parsedCuratorId < 1) {
    throw badRequest('"curatorId" must be a positive integer.');
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const rawOffset = searchParams.get('offset') ?? '0';
  const offset = parseInt(rawOffset, 10);
  if (isNaN(offset) || offset < 0) {
    throw badRequest('"offset" must be an integer >= 0.');
  }

  const rawLimit = searchParams.get('limit') ?? '50';
  const limit = parseInt(rawLimit, 10);
  if (isNaN(limit) || limit < 1 || limit > 10_000) {
    throw badRequest('"limit" must be an integer between 1 and 10000.');
  }

  if (offset + limit > 10_000) {
    throw badRequest('"offset + limit" must not exceed 10000.');
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  const rawSort = searchParams.get('sortColumn');
  let sortColumn: string;
  if (!rawSort || rawSort.trim() === '') {
    sortColumn = config.defaultSort;
  } else if (config.allowedSorts.includes(rawSort.trim())) {
    sortColumn = rawSort.trim();
  } else {
    throw badRequest(
      `Invalid "sortColumn" for platform "${validatedPlatform}": "${rawSort}". ` +
        `Allowed values: ${config.allowedSorts.join(', ')}.`,
    );
  }

  const sortOrderDesc = parseBoolean(searchParams.get('sortOrderDesc'), true);

  // ── Storefront ────────────────────────────────────────────────────────────
  const storefront = parseOptionalIsoAlpha2(searchParams.get('storefront'));

  return {
    platform: validatedPlatform,
    curatorId: parsedCuratorId,
    storefront,
    limit,
    offset,
    sortColumn,
    sortOrderDesc,
  };
}
