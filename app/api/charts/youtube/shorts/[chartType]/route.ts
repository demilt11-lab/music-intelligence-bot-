/**
 * GET /api/charts/youtube/shorts/[chartType]
 *
 * Returns a paginated YouTube Shorts chart snapshot.
 *
 * Path parameters:
 * - `chartType` – 'shorts_daily' | 'shorts_weekly'.
 *
 * Query parameters:
 * - `code2`   (string, required)        – ISO alpha-2 country code or 'GLOBAL'.
 * - `date`    (string, YYYY-MM-DD)      – Required unless `latest=true`.
 * - `latest`  (boolean)                 – If true, uses the most recent snapshot.
 * - `limit`   (integer, 1–1000)         – Default 50.
 * - `offset`  (integer, >= 0)           – Default 0.
 *
 * Responses:
 * - `200` – `{ obj: { length: number; data: YouTubeShortsChartRow[] } }`
 * - `400` – Validation error.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateYouTubeShortsChartParams } from '@/lib/charts/youtube-shorts/validate';
import { getYouTubeShortsChart } from '@/lib/charts/youtube-shorts/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for the YouTube Shorts chart.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the `chartType` path segment.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ chartType: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const chartParams = validateYouTubeShortsChartParams(
      request.nextUrl.searchParams,
      params.chartType,
    );
    const result = await getYouTubeShortsChart(chartParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
