/**
 * Validation for the Broadcast Markets endpoint parameters.
 */

import { badRequest } from '@/lib/shared/errors';
import { defaultSince, toIsoDateString, parseIsoDate } from '@/lib/shared/dates';
import type { BroadcastMarketsParams, AirplayEntityType } from './types';

const ENTITY_TYPES: AirplayEntityType[] = ['artist', 'album', 'track'];

/**
 * Validates and parses path + query parameters for GET /api/radio/:type/:id/broadcast-markets.
 *
 * @param type         - Raw entity type path segment (e.g. "artist").
 * @param id           - Raw entity id path segment (numeric string).
 * @param searchParams - URL search parameters from the request.
 * @returns Validated {@link BroadcastMarketsParams}.
 * @throws ApiError(400) on any invalid input.
 */
export function validateBroadcastMarketsParams(
  type: string,
  id: string,
  searchParams: URLSearchParams,
): BroadcastMarketsParams {
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

  return {
    type:  type as AirplayEntityType,
    id:    parsedId,
    since,
  };
}
