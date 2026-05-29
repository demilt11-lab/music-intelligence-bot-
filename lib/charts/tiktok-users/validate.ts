/**
 * TikTok User Chart – request validation.
 * @module lib/charts/tiktok-users/validate
 */

import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseEnum,
  parseOptionalPositiveInt,
} from '@/lib/shared/validation';
import {
  TikTokUserChartInterval,
  TikTokUserChartParams,
  TikTokUserChartType,
} from './types';

/** Valid chart metric types. */
const CHART_TYPES: readonly TikTokUserChartType[] = ['likes', 'followers'] as const;

/** Valid chart interval values. */
const CHART_INTERVALS: readonly TikTokUserChartInterval[] = [
  'daily',
  'weekly',
  'monthly',
  'semi_yearly',
  'yearly',
  'all_time',
] as const;

/** Regular expression for YYYY-MM-DD date strings. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and coerces raw URL search parameters into a typed
 * {@link TikTokUserChartParams} object.
 *
 * Rules:
 * - `type`     – required; 'likes' | 'followers'.
 * - `interval` – default 'daily'.
 * - `latest`   – boolean, default `false`.
 * - `date`     – required unless `latest=true`; must be YYYY-MM-DD.
 * - `limit`    – integer 1–100, default 50.
 * - `offset`   – integer 0–9900, default 0.
 *
 * @param searchParams - The incoming URL search parameters.
 * @returns Validated parameters.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateTikTokUserChartParams(
  searchParams: URLSearchParams,
): TikTokUserChartParams {
  const type = parseEnum(
    searchParams.get('type'),
    CHART_TYPES,
    'type',
  );

  const interval = parseEnum(
    searchParams.get('interval'),
    CHART_INTERVALS,
    'interval',
    'daily',
  );

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

  return { type, interval, date, latest, limit, offset };
}
