import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseOptionalPositiveInt,
  parseOptionalIsoAlpha2,
} from '@/lib/shared/validation';
import { AirplayDuration, AirplayTrackChartParams } from './types';

/** All valid duration values. */
const AIRPLAY_DURATIONS: readonly AirplayDuration[] = [
  'daily',
  'weekly',
  'monthly',
  'semi_yearly',
  'yearly',
  'all_time',
];

/** Regular expression for YYYY-MM-DD date strings. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses and validates an optional YYYY-MM-DD date string.
 *
 * @param raw   - Raw query parameter value.
 * @param field - Field name used in error messages.
 * @returns The trimmed date string, or `null` when absent.
 * @throws {ApiError} 400 when the value is present but malformed.
 */
function parseOptionalDate(raw: string | null, field: string): string | null {
  if (raw === null || raw.trim() === '') return null;
  const trimmed = raw.trim();
  if (!DATE_RE.test(trimmed)) {
    throw badRequest(`"${field}" must be in YYYY-MM-DD format; received "${trimmed}".`);
  }
  return trimmed;
}

/**
 * Validates and coerces raw URL search parameters into a typed
 * {@link AirplayTrackChartParams} object.
 *
 * Rules:
 * - `duration`     – required; one of `AirplayDuration`.
 * - `date`         – optional YYYY-MM-DD; defaults to latest.
 * - `since`        – optional YYYY-MM-DD lower bound.
 * - `limit`        – integer 1–500, default 50.
 * - `country_code` – ISO alpha-2 or "GLOBAL", default "GLOBAL".
 * - `city_id`      – optional positive integer.
 * - `latest`       – boolean, default `false`.
 *
 * @param searchParams - The incoming URL search parameters.
 * @returns Validated parameters.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateAirplayTrackChartParams(
  searchParams: URLSearchParams,
): AirplayTrackChartParams {
  const duration = parseEnum(
    searchParams.get('duration'),
    AIRPLAY_DURATIONS,
    'duration',
  );

  const latest = parseBoolean(searchParams.get('latest'), false);

  const date = parseOptionalDate(searchParams.get('date'), 'date');
  const since = parseOptionalDate(searchParams.get('since'), 'since');

  const limit =
    parseOptionalPositiveInt(searchParams.get('limit'), 1, 500) ?? 50;

  const rawCountry = searchParams.get('country_code');
  const countryCode =
    rawCountry !== null && rawCountry.trim() !== ''
      ? (parseOptionalIsoAlpha2(rawCountry) ?? 'GLOBAL')
      : 'GLOBAL';

  const cityId =
    parseOptionalPositiveInt(searchParams.get('city_id'), 1) ?? undefined;

  return { duration, date, since, limit, countryCode, cityId, latest };
}
