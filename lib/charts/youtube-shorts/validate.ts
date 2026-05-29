/**
 * YouTube Shorts Chart – request validation.
 * @module lib/charts/youtube-shorts/validate
 */

import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseIsoAlpha2,
  parseOptionalPositiveInt,
} from '@/lib/shared/validation';
import { YouTubeShortsChartParams, YouTubeShortsChartType } from './types';

/** Valid chart type values. */
const CHART_TYPES: readonly YouTubeShortsChartType[] = [
  'shorts_daily',
  'shorts_weekly',
] as const;

/** Regular expression for YYYY-MM-DD date strings. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and coerces raw URL search parameters into a typed
 * {@link YouTubeShortsChartParams} object.
 *
 * Rules:
 * - `chartType` – required path-derived value; 'shorts_daily' | 'shorts_weekly'.
 * - `code2`     – required ISO alpha-2 country code or 'GLOBAL'.
 * - `date`      – required unless `latest=true`; must be YYYY-MM-DD.
 * - `latest`    – boolean, default `false`.
 * - `limit`     – integer 1–1000, default 50.
 * - `offset`    – integer >= 0, default 0.
 *
 * @param searchParams   - The incoming URL search parameters.
 * @param rawChartType   - The `[chartType]` dynamic route segment value.
 * @returns Validated parameters.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateYouTubeShortsChartParams(
  searchParams: URLSearchParams,
  rawChartType: string,
): YouTubeShortsChartParams {
  const chartType = parseEnum(rawChartType, CHART_TYPES, 'chartType');

  const code2 = parseIsoAlpha2(searchParams.get('code2'));

  const latest = parseBoolean(searchParams.get('latest'), false);

  const rawDate = searchParams.get('date');
  let date: string | null = null;

  if (rawDate !== null && rawDate.trim() !== '') {
    const trimmed = rawDate.trim();
    if (!DATE_RE.test(trimmed)) {
      throw badRequest(`"date" must be in YYYY-MM-DD format; received "${trimmed}".`);
    }
    date = trimmed;
  } else if (!latest) {
    throw badRequest('"date" is required when "latest" is not true.');
  }

  const limit = parseOptionalPositiveInt(searchParams.get('limit'), 1, 1000) ?? 50;
  const offset = parseOptionalPositiveInt(searchParams.get('offset'), 0) ?? 0;

  return { chartType, code2, date, latest, limit, offset };
}
