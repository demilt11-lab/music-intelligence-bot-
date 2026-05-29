/**
 * GET /api/charts/tiktok/tracks/dates
 *
 * Returns all chart dates for which TikTok typed track snapshots exist for a
 * given chart type, sorted newest-first.
 *
 * Query parameters:
 * - `chartType` (string, required) – 'popular' | 'breakout'.
 *
 * Responses:
 * - `200` – `{ obj: string[] }` – Array of YYYY-MM-DD date strings.
 * - `400` – Missing or invalid `chartType` parameter.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseEnum } from '@/lib/shared/validation';
import { queryAvailableTikTokTypedTrackDates } from '@/lib/charts/tiktok-track-types/query';
import { TikTokTrackChartType } from '@/lib/charts/tiktok-track-types/types';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

const CHART_TYPES: readonly TikTokTrackChartType[] = ['popular', 'breakout'] as const;

/**
 * Handles GET requests for available TikTok typed track chart dates.
 *
 * @param request - The incoming Next.js request.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const chartType = parseEnum(
      request.nextUrl.searchParams.get('chartType'),
      CHART_TYPES,
      'chartType',
    );
    const dates = await queryAvailableTikTokTypedTrackDates(chartType);
    return successResponse({ obj: dates });
  } catch (err) {
    return handleApiError(err);
  }
}
