/**
 * GET /api/charts/youtube/shorts/dates
 *
 * Returns all chart dates for which YouTube Shorts snapshots exist for a given
 * chart type and country, sorted newest-first.
 *
 * Query parameters:
 * - `chartType` (string, required) – 'shorts_daily' | 'shorts_weekly'.
 * - `code2`     (string, required) – ISO alpha-2 country code or 'GLOBAL'.
 *
 * Responses:
 * - `200` – `{ obj: string[] }` – Array of YYYY-MM-DD date strings.
 * - `400` – Missing or invalid parameters.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseEnum, parseIsoAlpha2 } from '@/lib/shared/validation';
import { queryAvailableYouTubeShortsDates } from '@/lib/charts/youtube-shorts/query';
import { YouTubeShortsChartType } from '@/lib/charts/youtube-shorts/types';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

const CHART_TYPES: readonly YouTubeShortsChartType[] = [
  'shorts_daily',
  'shorts_weekly',
] as const;

/**
 * Handles GET requests for available YouTube Shorts chart dates.
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
    const code2 = parseIsoAlpha2(request.nextUrl.searchParams.get('code2'));
    const dates = await queryAvailableYouTubeShortsDates(chartType, code2);
    return successResponse({ obj: dates });
  } catch (err) {
    return handleApiError(err);
  }
}
