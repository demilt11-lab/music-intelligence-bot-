import { badRequest } from './errors';

/** Hard ceiling applied to offset + limit to prevent runaway queries. */
const ABSOLUTE_MAX = 10_000;

/**
 * Parsed and validated pagination parameters.
 */
interface PaginationParams {
  /** Maximum number of records to return. */
  limit: number;
  /** Zero-based index of the first record to return. */
  offset: number;
}

/**
 * Parses `limit` and `offset` from a `URLSearchParams` instance, applying
 * validation rules:
 * - `offset` must be >= 0.
 * - `limit` must be in the range `[1, maxLimit]`.
 * - `offset + limit` must not exceed 10 000.
 *
 * @param searchParams   - The incoming request search parameters.
 * @param defaultLimit   - Limit to use when the parameter is absent (default 50).
 * @param maxLimit       - Maximum allowed limit value (default 10 000).
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 50,
  maxLimit = ABSOLUTE_MAX,
): PaginationParams {
  const rawLimit = searchParams.get('limit');
  const rawOffset = searchParams.get('offset');

  let limit = defaultLimit;
  let offset = 0;

  if (rawOffset !== null) {
    const parsed = parseInt(rawOffset, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw badRequest(`"offset" must be a non-negative integer; received "${rawOffset}".`);
    }
    offset = parsed;
  }

  if (rawLimit !== null) {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed < 1) {
      throw badRequest(`"limit" must be a positive integer; received "${rawLimit}".`);
    }
    if (parsed > maxLimit) {
      throw badRequest(`"limit" must not exceed ${maxLimit}; received ${parsed}.`);
    }
    limit = parsed;
  }

  if (offset + limit > ABSOLUTE_MAX) {
    throw badRequest(
      `offset (${offset}) + limit (${limit}) must not exceed ${ABSOLUTE_MAX}.`,
    );
  }

  return { limit, offset };
}

/**
 * Wraps a page of results with metadata required for cursor-free pagination.
 *
 * @param data   - The records for the current page.
 * @param total  - Total number of matching records across all pages.
 * @param offset - The offset used to retrieve this page.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  offset: number,
): { obj: T[]; offset: number; total: number } {
  return { obj: data, offset, total };
}
