import { NextRequest, NextResponse } from 'next/server';
import { validateTikTokVideoTrendsParams } from '@/lib/tracks/tiktok-video-trends/validate';
import { getTikTokVideoTrends } from '@/lib/tracks/tiktok-video-trends/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/tiktok/videos/[videoId]/trends
 *
 * Returns daily engagement trend data (likes, comments, views) for a specific
 * TikTok video over a rolling look-back window.
 *
 * Path parameters:
 * - `videoId` — TikTok platform-specific video identifier (non-empty string).
 *
 * Query parameters:
 * - `fromDaysAgo` — Integer in [1, 365]. How many days of history to return
 *                   (default: 28).
 *
 * @param request - Incoming Next.js request object.
 * @param params  - Route segment params containing `videoId`.
 * @returns JSON response conforming to {@link TikTokVideoTrendsResponse}.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } },
): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validatedParams = validateTikTokVideoTrendsParams(
      params.videoId,
      searchParams,
    );
    const result = await getTikTokVideoTrends(validatedParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
