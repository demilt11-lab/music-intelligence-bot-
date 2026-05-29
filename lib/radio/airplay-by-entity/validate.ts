/**
 * Validation for the Airplay-by-Entity endpoint parameters.
 */

import { badRequest } from '@/lib/shared/errors';
import { defaultSince, toIsoDateString, parseIsoDate } from '@/lib/shared/dates';
import type {
  AirplayByEntityParams,
  AirplayEntityDimension,
  AirplayEntityType,
  TimestampFormat,
} from './types';

const ENTITY_TYPES: AirplayEntityType[] = ['artist', 'album', 'track'];
const ENTITY_DIMENSIONS: AirplayEntityDimension[] = ['country', 'city', 'station', 'track'];
const TIMESTAMP_FORMATS: TimestampFormat[] = ['ISO', 'UNIX'];

/**
 * Validates and parses path + query parameters for the airplay-by-entity route.
 *
 * @param type         - Raw entity type path segment (e.g. "artist").
 * @param id           - Raw entity id path segment (numeric string).
 * @param entity       - Raw dimension path segment (e.g. "country").
 * @param searchParams - URL search parameters from the request.
 * @returns Validated {@link AirplayByEntityParams}.
 * @throws ApiError(400) on any invalid input.
 */
export function validateAirplayByEntityParams(
  type: string,
  id: string,
  entity: string,
  searchParams: URLSearchParams,
): AirplayByEntityParams {
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

  // --- entity ---
  if (!ENTITY_DIMENSIONS.includes(entity as AirplayEntityDimension)) {
    throw badRequest(
      `Invalid "entity": "${entity}". Allowed values: ${ENTITY_DIMENSIONS.join(', ')}.`,
    );
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

  // --- dateFormat ---
  const rawDateFormat = searchParams.get('dateFormat');
  let dateFormat: TimestampFormat = 'ISO';
  if (rawDateFormat && rawDateFormat.trim() !== '') {
    if (!TIMESTAMP_FORMATS.includes(rawDateFormat as TimestampFormat)) {
      throw badRequest(
        `Invalid "dateFormat": "${rawDateFormat}". Allowed values: ${TIMESTAMP_FORMATS.join(', ')}.`,
      );
    }
    dateFormat = rawDateFormat as TimestampFormat;
  }

  return {
    type: type as AirplayEntityType,
    id: parsedId,
    entity: entity as AirplayEntityDimension,
    since,
    station,
    limit,
    dateFormat,
  };
}
