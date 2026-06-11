import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseOptionalBoolean,
  parseOptionalIsoAlpha2,
  parseOptionalString,
} from '@/lib/shared/validation';
import { getCuratorPlatformConfig } from './platform-config';
import { CURATOR_PLATFORMS, type CuratorListParams, type CuratorPlatform } from './types';

/**
 * Parses a comma- or multi-value query parameter into an array of integers,
 * silently discarding any non-numeric tokens.
 *
 * @param raw - Raw query-param string (may be comma-separated).
 * @returns Parsed integer array, empty when the param is absent or blank.
 */
function parseIntArray(raw: string | null): number[] {
  if (!raw || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

/**
 * Validates and coerces all query parameters for `GET /api/curators/:platform`.
 *
 * Validation rules:
 * - `platform`               – must be one of {@link CURATOR_PLATFORMS}.
 * - `offset`                 – integer >= 0, default 0.
 * - `limit`                  – integer 1–10 000, default 50.
 * - `offset + limit`         – must not exceed 10 000.
 * - `sortColumn`             – must be in the platform's `allowedSorts`; falls back to `defaultSort`.
 * - `sortOrderDesc`          – boolean, default true.
 * - `shortlistIds`           – comma-separated list of integers.
 * - `nameSearch`             – optional free-text string.
 * - `playlistKeywordSearch`  – optional free-text string.
 * - `withSocialUrls`         – boolean (spotify only), default false.
 * - `editorial`              – optional boolean.
 * - `majorLabel`             – optional boolean, platform must support it.
 * - `brand`                  – optional boolean, platform must support it.
 * - `popularIndie`           – optional boolean, platform must support it.
 * - `indie`                  – optional boolean, platform must support it.
 * - `audiobook`              – optional boolean.
 * - `code2`                  – ISO alpha-2 country code, platform must support it.
 *
 * @param platform     - The raw `:platform` path segment.
 * @param searchParams - Parsed URL search parameters.
 * @returns Validated {@link CuratorListParams}.
 * @throws {@link ApiError} with status 400 on invalid input.
 */
export function validateCuratorListParams(
  platform: string,
  searchParams: URLSearchParams,
): CuratorListParams {
  // ── Platform ──────────────────────────────────────────────────────────────
  const validatedPlatform = parseEnum<CuratorPlatform>(
    platform,
    CURATOR_PLATFORMS,
    'platform',
  );

  const config = getCuratorPlatformConfig(validatedPlatform);

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

  // ── Filters ───────────────────────────────────────────────────────────────
  const shortlistIds = parseIntArray(searchParams.get('shortlistIds'));
  const nameSearch = parseOptionalString(searchParams.get('nameSearch'));
  const playlistKeywordSearch = parseOptionalString(
    searchParams.get('playlistKeywordSearch'),
  );

  // withSocialUrls is only meaningful for spotify
  const withSocialUrls = config.supportsWithSocialUrls
    ? parseBoolean(searchParams.get('withSocialUrls'), false)
    : false;

  const editorial = parseOptionalBoolean(searchParams.get('editorial'));

  // majorLabel
  let majorLabel: boolean | undefined;
  if (searchParams.has('majorLabel')) {
    if (!config.supportsMajorLabel) {
      throw badRequest(
        `"majorLabel" filter is not supported for platform "${validatedPlatform}".`,
      );
    }
    majorLabel = parseOptionalBoolean(searchParams.get('majorLabel'));
  }

  // brand
  let brand: boolean | undefined;
  if (searchParams.has('brand')) {
    if (!config.supportsBrand) {
      throw badRequest(
        `"brand" filter is not supported for platform "${validatedPlatform}".`,
      );
    }
    brand = parseOptionalBoolean(searchParams.get('brand'));
  }

  // popularIndie
  let popularIndie: boolean | undefined;
  if (searchParams.has('popularIndie')) {
    if (!config.supportsPopularIndie) {
      throw badRequest(
        `"popularIndie" filter is not supported for platform "${validatedPlatform}".`,
      );
    }
    popularIndie = parseOptionalBoolean(searchParams.get('popularIndie'));
  }

  // indie
  let indie: boolean | undefined;
  if (searchParams.has('indie')) {
    if (!config.supportsIndie) {
      throw badRequest(
        `"indie" filter is not supported for platform "${validatedPlatform}".`,
      );
    }
    indie = parseOptionalBoolean(searchParams.get('indie'));
  }

  const audiobook = parseOptionalBoolean(searchParams.get('audiobook'));

  // code2
  let code2: string | undefined;
  if (searchParams.has('code2')) {
    if (!config.supportsCode2) {
      throw badRequest(
        `"code2" filter is not supported for platform "${validatedPlatform}".`,
      );
    }
    code2 = parseOptionalIsoAlpha2(searchParams.get('code2'));
  }

  return {
    platform: validatedPlatform,
    offset,
    limit,
    sortColumn,
    sortOrderDesc,
    shortlistIds,
    nameSearch,
    playlistKeywordSearch,
    withSocialUrls,
    editorial,
    majorLabel,
    brand,
    popularIndie,
    indie,
    audiobook,
    code2,
  };
}
