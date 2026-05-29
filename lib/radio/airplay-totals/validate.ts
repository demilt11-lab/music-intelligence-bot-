/**
 * Validation for the deprecated aggregate Airplay Totals endpoint.
 */

import { badRequest } from '@/lib/shared/errors';
import { defaultSince, toIsoDateString, parseIsoDate } from '@/lib/shared/dates';
import type { AirplayTotalsParams, AirplayEntityType } from './types';

const ENTITY_TYPES: AirplayEntityType[] = ['artist', 'album', 'track'];

/**
 * Validates and parses path + query parameters for GET /api/radio/:type/:id/airplay-totals.
 *
 * @param type         - Raw entity type path segment (e.g. "artist").
 * @param id           - Raw entity id path segment (numeric string).
 * @param searchParams - URL search parameters from the request.
 * @returns Validated {@link AirplayTotalsParams}.
 * @throws ApiError(400) on any invalid input.
 */
export function validateAirplayTotalsParams(
  type: string,
  id: string,
  searchParams: URLSearchParams,
): AirplayTotalsParams {
  // --- type ---
  if (!ENTITY_TYPES.includes(type as AirplayEntityType)) {
    throw badRequest(
      `Invalid "type": "${type}". Allowed values: ${ENTITY_TYPES.join(', ')}.`,
    );
  }

  // --- id ---
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId < 1) {
    throw badRequest(`"id" must be a positive integer; received "${id}".`);
  }

  // --- since ---
  const rawSince = searchParams.get('since');
  const since = rawSince
    ? toIsoDateString(parseIsoDate(rawSince))
    : defaultSince(180);

  // --- station ---
  const rawStation = searchParams.get('station');
  let station: number | undefined;
  if (rawStation && rawStation.trim() !== '') {
    const s = parseInt(rawStation, 10);
    if (isNaN(s) || s < 1) {
      throw badRequest(`"station" must be a positive integer; received "${rawStation}".`);
    }
    station = s;
  }

  // --- limit ---
  const rawLimit = searchParams.get('limit');
  let limit = 20;
  if (rawLimit && rawLimit.trim() !== '') {
    const l = parseInt(rawLimit, 10);
    if (isNaN(l) || l < 1 || l > 100) {
      throw badRequest('"limit" must be between 1 and 100.');
    }
    limit = l;
  }

  return {
    type:    type as AirplayEntityType,
    id:      parsedId,
    since,
    station,
    limit,
  };
}
