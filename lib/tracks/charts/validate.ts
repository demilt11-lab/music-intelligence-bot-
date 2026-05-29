import { badRequest } from '@/lib/shared/errors';
import { dateRangeDefaults } from '@/lib/shared/dates';
import { CHART_TYPES, ChartType } from './types';

/**
 * Validated, typed parameters for the track chart-appearances query.
 */
export interface TrackChartParams {
  /** Resolved internal track ID. */
  trackId: number;
  /** Resolved chart type, narrowed to {@link ChartType}. */
  chartType: ChartType;
  /** ISO date string for the start of the query window. */
  since: string;
  /** ISO date string for the end of the query window. */
  until: string;
}

/**
 * Validates and resolves query parameters for the track chart-appearances
 * endpoint.
 *
 * Rules:
 * - `trackId` must be a positive integer.
 * - `chartType` must be one of the values in {@link CHART_TYPES}.
 * - `since` defaults to 180 days ago when absent; validated as ISO date when
 *   provided.
 * - `until` defaults to today when absent; validated as ISO date when provided.
 *
 * @param trackId      - Raw `trackId` path segment.
 * @param chartType    - Raw `chartType` path segment.
 * @param searchParams - Incoming URL search parameters.
 * @returns Fully resolved {@link TrackChartParams}.
 * @throws {ApiError} 400 on any validation failure.
 */
export function validateTrackChartParams(
  trackId: string,
  chartType: string,
  searchParams: URLSearchParams,
): TrackChartParams {
  // ── trackId ──────────────────────────────────────────────────────────────
  const parsedId = parseInt(trackId, 10);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    throw badRequest(
      `"trackId" must be a positive integer; received "${trackId}".`,
    );
  }

  // ── chartType ─────────────────────────────────────────────────────────────
  if (!(CHART_TYPES as readonly string[]).includes(chartType)) {
    throw badRequest(
      `Invalid "chartType": "${chartType}". Allowed values: ${CHART_TYPES.join(', ')}.`,
    );
  }

  // ── date range ────────────────────────────────────────────────────────────
  const sinceRaw = searchParams.get('since') ?? undefined;
  const untilRaw = searchParams.get('until') ?? undefined;
  const { since, until } = dateRangeDefaults(sinceRaw, untilRaw, 180);

  return {
    trackId: parsedId,
    chartType: chartType as ChartType,
    since,
    until,
  };
}
