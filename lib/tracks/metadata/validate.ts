import { badRequest } from '@/lib/shared/errors';

/**
 * Parses and validates a track ID from a URL path segment.
 *
 * @param id - The raw string segment (e.g. from `params.trackId`).
 * @returns A positive integer track ID.
 * @throws {ApiError} 400 when `id` is missing, not a valid integer, or <= 0.
 */
export function validateTrackId(id: string): number {
  if (!id || id.trim() === '') {
    throw badRequest('"trackId" is required.');
  }
  const parsed = parseInt(id.trim(), 10);
  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    throw badRequest(`"trackId" must be an integer; received "${id}".`);
  }
  if (parsed <= 0) {
    throw badRequest(`"trackId" must be a positive integer; received ${parsed}.`);
  }
  return parsed;
}
