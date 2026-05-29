import { badRequest } from './errors';

/**
 * Parses an ISO 8601 date string and returns a `Date` object.
 * Throws a 400 `ApiError` if the string is missing or produces an invalid date.
 *
 * @param s - ISO 8601 date string (e.g. `"2024-01-15"` or `"2024-01-15T12:00:00Z"`).
 */
export function parseIsoDate(s: string): Date {
  if (!s || typeof s !== 'string') {
    throw badRequest('A valid ISO date string is required.');
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    throw badRequest(`Invalid date: "${s}". Expected an ISO 8601 date string.`);
  }
  return d;
}

/**
 * Returns an ISO date string for midnight UTC exactly `daysAgo` days before today.
 *
 * @param daysAgo - Number of days in the past (default 180).
 */
export function defaultSince(daysAgo = 180): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return toIsoDateString(d);
}

/**
 * Returns today's date as an ISO date string (`YYYY-MM-DD`) in UTC.
 */
export function defaultUntil(): string {
  return toIsoDateString(new Date());
}

/**
 * Formats a `Date` as a `YYYY-MM-DD` string using UTC components.
 *
 * @param d - The date to format.
 */
export function toIsoDateString(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a `Date` to a Unix timestamp (seconds since epoch).
 *
 * @param d - The date to convert.
 */
export function toUnixTimestamp(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Formats a date as either an ISO string or a Unix timestamp integer.
 *
 * @param d      - A `Date` instance or an ISO date string.
 * @param format - `'ISO'` returns a `YYYY-MM-DD` string; `'UNIX'` returns seconds since epoch.
 */
export function formatTimestamp(
  d: Date | string,
  format: 'ISO' | 'UNIX',
): string | number {
  const date = typeof d === 'string' ? parseIsoDate(d) : d;
  if (format === 'ISO') {
    return toIsoDateString(date);
  }
  return toUnixTimestamp(date);
}

/**
 * Resolves `since` / `until` query parameters, falling back to sensible
 * defaults when they are absent.
 *
 * - `since` defaults to `daysAgo` days before today.
 * - `until` defaults to today.
 *
 * Both values are validated as ISO date strings when provided; a 400 error is
 * thrown on invalid input.
 *
 * @param since   - Optional ISO date string for the start of the range.
 * @param until   - Optional ISO date string for the end of the range.
 * @param daysAgo - How far back the default `since` should reach (default 180).
 */
export function dateRangeDefaults(
  since?: string,
  until?: string,
  daysAgo = 180,
): { since: string; until: string } {
  const resolvedSince = since ? toIsoDateString(parseIsoDate(since)) : defaultSince(daysAgo);
  const resolvedUntil = until ? toIsoDateString(parseIsoDate(until)) : defaultUntil();

  if (new Date(resolvedSince) > new Date(resolvedUntil)) {
    throw badRequest(
      `"since" (${resolvedSince}) must not be later than "until" (${resolvedUntil}).`,
    );
  }

  return { since: resolvedSince, until: resolvedUntil };
}
