/**
 * Input validation for the Playlist Tracks endpoint.
 */

import { badRequest } from '@/lib/shared/errors';
import { parseBoolean, parseOptionalString } from '@/lib/shared/validation';
import type { PlaylistSpan, PlaylistTracksParams } from './types';

const SPAN_VALUES: readonly PlaylistSpan[] = ['current', 'past'];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

/**
 * Parses a repeated or comma-separated string array parameter.
 *
 * @param searchParams - The request's URLSearchParams.
 * @param key - The parameter key.
 */
function parseStringArray(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key);
  if (values.length === 0) return [];
  return values
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Validates and coerces path/search parameters into {@link PlaylistTracksParams}.
 *
 * Validation rules:
 * - `span` must be `"current"` or `"past"`.
 * - `since` / `until` are only accepted for `span=past`.
 * - `version_only` cannot be combined with `version_and`, `version_or`, or `version_not`.
 * - `version_and` cannot be combined with `version_or`.
 * - `limit` must be in the range [1, 1000]; defaults to 100.
 * - `offset` must be >= 0; defaults to 0.
 *
 * @param platform - The raw platform string from the URL.
 * @param playlistId - The raw playlist ID string from the URL.
 * @param span - The raw span string from the URL.
 * @param searchParams - The request's URLSearchParams.
 */
export function validatePlaylistTracksParams(
  platform: string,
  playlistId: string,
  span: string,
  searchParams: URLSearchParams,
): PlaylistTracksParams {
  // --- playlistId ---
  const parsedPlaylistId = parseInt(playlistId, 10);
  if (isNaN(parsedPlaylistId) || parsedPlaylistId < 1) {
    throw badRequest(`"playlistId" must be a positive integer; received "${playlistId}".`);
  }

  // --- span ---
  if (!SPAN_VALUES.includes(span as PlaylistSpan)) {
    throw badRequest(
      `Invalid span "${span}". Must be one of: ${SPAN_VALUES.join(', ')}`,
    );
  }
  const typedSpan = span as PlaylistSpan;

  // --- withDetails ---
  const withDetails = parseBoolean(searchParams.get('with_details'), true);

  // --- date range (past only) ---
  const rawSince = parseOptionalString(searchParams.get('since'));
  const rawUntil = parseOptionalString(searchParams.get('until'));

  if (typedSpan === 'current') {
    if (rawSince !== undefined) {
      throw badRequest('"since" is only valid for span=past.');
    }
    if (rawUntil !== undefined) {
      throw badRequest('"until" is only valid for span=past.');
    }
  }

  // --- storefront ---
  const storefront = parseOptionalString(searchParams.get('storefront'));

  // --- version filters ---
  const versionOnly = parseStringArray(searchParams, 'version_only');
  const versionAnd = parseStringArray(searchParams, 'version_and');
  const versionOr = parseStringArray(searchParams, 'version_or');
  const versionNot = parseStringArray(searchParams, 'version_not');

  if (versionOnly.length > 0 && (versionAnd.length > 0 || versionOr.length > 0 || versionNot.length > 0)) {
    throw badRequest(
      '"version_only" cannot be combined with "version_and", "version_or", or "version_not".',
    );
  }
  if (versionAnd.length > 0 && versionOr.length > 0) {
    throw badRequest('"version_and" cannot be combined with "version_or".');
  }

  // --- pagination ---
  const rawOffset = searchParams.get('offset');
  let offset = 0;
  if (rawOffset !== null) {
    const parsed = parseInt(rawOffset, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw badRequest(`"offset" must be a non-negative integer; received "${rawOffset}".`);
    }
    offset = parsed;
  }

  const rawLimit = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw badRequest(`"limit" must be between 1 and ${MAX_LIMIT}; received "${rawLimit}".`);
    }
    limit = parsed;
  }

  return {
    platform,
    playlistId: parsedPlaylistId,
    span: typedSpan,
    withDetails,
    since: rawSince,
    until: rawUntil,
    storefront,
    versionOnly,
    versionAnd,
    versionOr,
    versionNot,
    limit,
    offset,
  };
}
