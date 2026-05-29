/**
 * TikTok Typed Track Chart – request validation.
 * @module lib/charts/tiktok-track-types/validate
 */

import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseOptionalIsoAlpha2,
  parseOptionalPositiveInt,
} from '@/lib/shared/validation';
import { TikTokTrackChartType, TikTokTypedTrackChartParams } from './types';

/** Valid chart type values. */
const CHART_TYPES: readonly TikTokTrackChartType[] = ['popular', 'breakout'] as const;

/** Regular expression for YYYY-MM-DD date strings. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and coerces raw URL search parameters into a typed
 * {@link TikTokTypedTrackChartParams} object.
 *
 * Rules:
 * - `chartType` – required path-derived value; 'popular' | 'breakout'.
 * - `date`      – required unless `latest=true`; must be YYYY-MM-DD.
 * - `interval`  – if provided, must be 'weekly'.
 * - `latest`    – boolean, default `false`.
 * - `limit`     – integer 1–100, default 50.
 * - `offset`    – integer 0–9900, default 0.
 * - `code2`     – optional ISO alpha-2 country code.
 *
 * @param searchParams   - The incoming URL search parameters.
 * @param rawChartType   - The `[chartType]` dynamic route segment value.
 * @returns Validated parameters.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateTikTokTypedTrackChartParams(
  searchParams: URLSearchParams,
  rawChartType: string,
): TikTokTypedTrackChartParams {
  const chartType = parseEnum(rawChartType, CHART_TYPES, 'chartType');

  // interval, if supplied, must be 'weekly'
  const rawInterval = searchParams.get('interval');
  if (rawInterval !== null && rawInterval.trim() !== '') {
    if (rawInterval.trim() !== 'weekly') {
      throw badRequest('"interval" must be "weekly" for TikTok typed track charts.');
    }
  }

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

  const limit = parseOptionalPositiveInt(searchParams.get('limit'), 1, 100) ?? 50;
  const offset = parseOptionalPositiveInt(searchParams.get('offset'), 0, 9900) ?? 0;
  const code2 = parseOptionalIsoAlpha2(searchParams.get('code2'));

  return { chartType, date, latest, limit, offset, code2 };
}
