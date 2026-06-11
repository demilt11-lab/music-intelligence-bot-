/**
 * GET /api/charts/tiktok/tracks/[chartType]
 *
 * Returns a paginated TikTok typed track chart snapshot.
 *
 * Path parameters:
 * - `chartType` – 'popular' | 'breakout'.
 *
 * Query parameters:
 * - `date`     (string, YYYY-MM-DD)  – Required unless `latest=true`.
 * - `latest`   (boolean)             – If true, uses the most recent snapshot.
 * - `interval` (string)              – If provided, must be 'weekly'.
 * - `limit`    (integer, 1–100)      – Default 50.
 * - `offset`   (integer, 0–9900)     – Default 0.
 * - `code2`    (string)              – Optional ISO alpha-2 country filter.
 *
 * Responses:
 * - `200` – `{ obj: TikTokTypedTrackChartRow[] }`
 * - `400` – Validation error.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateTikTokTypedTrackChartParams } from '@/lib/charts/tiktok-track-types/validate';
import { getTikTokTypedTrackChart } from '@/lib/charts/tiktok-track-types/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for the TikTok typed track chart.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the `chartType` path segment.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ chartType: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const chartParams = validateTikTokTypedTrackChartParams(
      request.nextUrl.searchParams,
      params.chartType,
    );
    const result = await getTikTokTypedTrackChart(chartParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
