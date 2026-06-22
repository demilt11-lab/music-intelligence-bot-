import {
  parseString,
  parseEnum,
  parseBoolean,
  parseStringArray,
} from '@/lib/shared/validation';
import { badRequest } from '@/lib/shared/errors';
import {
  SearchEntityType,
  SearchParams,
  SEARCH_ENTITY_TYPES,
} from './types';

/** Maximum allowed length for the search query string. Raised to 300 to allow full platform URLs. */
const MAX_Q_LENGTH = 300;
/** Default number of results per page. */
const DEFAULT_LIMIT = 20;
/** Maximum allowed results per page. */
const MAX_LIMIT = 100;

/**
 * Parses and validates search query parameters from a URLSearchParams instance.
 *
 * @param searchParams - The raw URLSearchParams from the incoming request.
 * @returns A fully validated {@link SearchParams} object.
 * @throws {ApiError} 400 when required params are missing or values are invalid.
 */
export function validateSearchParams(searchParams: URLSearchParams): SearchParams {
  // q — required, max 100 chars
  const q = parseString(searchParams.get('q'), 'q', MAX_Q_LENGTH);

  // limit — 1..100, default 20
  const rawLimit = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit.trim() !== '') {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw badRequest('"limit" must be an integer.');
    }
    if (parsed < 1 || parsed > MAX_LIMIT) {
      throw badRequest(`"limit" must be between 1 and ${MAX_LIMIT}; received ${parsed}.`);
    }
    limit = parsed;
  }

  // offset — >=0, default 0
  const rawOffset = searchParams.get('offset');
  let offset = 0;
  if (rawOffset !== null && rawOffset.trim() !== '') {
    const parsed = parseInt(rawOffset, 10);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      throw badRequest('"offset" must be an integer.');
    }
    if (parsed < 0) {
      throw badRequest(`"offset" must be >= 0; received ${parsed}.`);
    }
    offset = parsed;
  }

  // type — SearchEntityType enum, default 'all'
  const type = parseEnum<SearchEntityType>(
    searchParams.get('type'),
    SEARCH_ENTITY_TYPES,
    'type',
    'all',
  );

  // beta — boolean, default false
  const beta = parseBoolean(searchParams.get('beta'), false);

  // platforms — comma-separated or repeated; only relevant when beta=true
  const rawPlatforms: string[] = [];
  // collect all values for repeated param
  searchParams.forEach((value, key) => {
    if (key === 'platforms') {
      rawPlatforms.push(value);
    }
  });
  const platforms = beta
    ? parseStringArray(rawPlatforms.length > 0 ? rawPlatforms : searchParams.get('platforms'))
    : [];

  // triggerCitiesOnly — boolean, default false
  const triggerCitiesOnly = parseBoolean(searchParams.get('triggerCitiesOnly'), false);

  return { q, limit, offset, type, beta, platforms, triggerCitiesOnly };
}
