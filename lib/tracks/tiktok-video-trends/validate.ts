import { badRequest } from '@/lib/shared/errors';
import { TikTokVideoTrendsParams } from './types';

/** Minimum allowed value for `fromDaysAgo`. */
const FROM_DAYS_AGO_MIN = 1;

/** Maximum allowed value for `fromDaysAgo`. */
const FROM_DAYS_AGO_MAX = 365;

/** Default value for `fromDaysAgo` when the query param is absent. */
const FROM_DAYS_AGO_DEFAULT = 28;

/**
 * Validates and resolves query parameters for the TikTok video trends endpoint.
 *
 * Rules:
 * - `videoId` must be a non-empty string after trimming.
 * - `fromDaysAgo` must be an integer in [1, 365]; defaults to 28.
 *
 * @param videoId      - Raw `videoId` path segment.
 * @param searchParams - Incoming URL search parameters.
 * @returns Fully resolved {@link TikTokVideoTrendsParams}.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateTikTokVideoTrendsParams(
  videoId: string,
  searchParams: URLSearchParams,
): TikTokVideoTrendsParams {
  // ── videoId ───────────────────────────────────────────────────────────────
  const trimmedId = videoId.trim();
  if (!trimmedId) {
    throw badRequest('"videoId" must be a non-empty string.');
  }

  // ── fromDaysAgo ───────────────────────────────────────────────────────────
  const rawDays = searchParams.get('fromDaysAgo');
  let fromDaysAgo: number;

  if (rawDays === null || rawDays.trim() === '') {
    fromDaysAgo = FROM_DAYS_AGO_DEFAULT;
  } else {
    const parsed = parseInt(rawDays, 10);
    if (!Number.isInteger(parsed)) {
      throw badRequest(
        `"fromDaysAgo" must be an integer; received "${rawDays}".`,
      );
    }
    if (parsed < FROM_DAYS_AGO_MIN || parsed > FROM_DAYS_AGO_MAX) {
      throw badRequest(
        `"fromDaysAgo" must be between ${FROM_DAYS_AGO_MIN} and ${FROM_DAYS_AGO_MAX}; received ${parsed}.`,
      );
    }
    fromDaysAgo = parsed;
  }

  return { videoId: trimmedId, fromDaysAgo };
}
