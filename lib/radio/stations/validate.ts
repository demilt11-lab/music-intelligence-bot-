/**
 * Validation for the Radio Stations endpoint parameters.
 */

import { badRequest } from '@/lib/shared/errors';
import type { RadioStationsParams } from './types';

const ISO_ALPHA2_RE = /^[A-Z]{2}$/;

/**
 * Validates and parses query parameters for GET /api/radio/stations.
 *
 * @param searchParams - The incoming URL search parameters.
 * @returns Validated {@link RadioStationsParams}.
 * @throws ApiError(400) when `code2` is missing or not exactly 2 uppercase letters.
 */
export function validateRadioStationsParams(
  searchParams: URLSearchParams,
): RadioStationsParams {
  const raw = searchParams.get('code2');

  if (!raw || raw.trim() === '') {
    throw badRequest('"code2" is required. Expected a 2-letter ISO alpha-2 country code.');
  }

  const upper = raw.trim().toUpperCase();

  if (!ISO_ALPHA2_RE.test(upper)) {
    throw badRequest(
      `Invalid value for "code2": "${raw}". Expected exactly 2 uppercase letters.`,
    );
  }

  return { code2: upper };
}
