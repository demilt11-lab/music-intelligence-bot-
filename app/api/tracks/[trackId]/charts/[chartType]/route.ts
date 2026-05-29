import { NextRequest, NextResponse } from 'next/server';
import { validateTrackChartParams } from '@/lib/tracks/charts/validate';
import { getTrackChartAppearances } from '@/lib/tracks/charts/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/tracks/[trackId]/charts/[chartType]
 *
 * Returns chart-appearance rows for a track on a specific chart type within an
 * optional date window.
 *
 * Query parameters:
 * - `since` — ISO date string (default: 180 days ago)
 * - `until` — ISO date string (default: today)
 *
 * @param request - Incoming Next.js request object (carries search params).
 * @param params  - Route segment params containing `trackId` and `chartType`.
 * @returns JSON response conforming to {@link TrackChartsResponse}.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { trackId: string; chartType: string } },
): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validatedParams = validateTrackChartParams(
      params.trackId,
      params.chartType,
      searchParams,
    );
    const result = await getTrackChartAppearances(validatedParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
