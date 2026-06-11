import { NextRequest, NextResponse } from 'next/server';
import { validatePlatformStatsParams } from '@/lib/tracks/platform-stats/validate';
import { getTrackPlatformStats } from '@/lib/tracks/platform-stats/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/tracks/[id]/platforms/[platform]/stats/[mode]
 *
 * Returns a platform-specific time-series stat for a track.
 *
 * Path parameters:
 * - `id`       — Internal track ID (positive integer), or a platform domain ID
 *               when `isDomainId=true` is passed as a query param.
 * - `platform` — Platform identifier (e.g. `"spotify"`, `"tiktok"`).
 * - `mode`     — Result-selection mode: `"highest-playcounts"` | `"most-history"`.
 *
 * Query parameters:
 * - `type`         — Stat type (defaults to the first type for the platform).
 * - `since`        — ISO date string (default: 180 days ago).
 * - `until`        — ISO date string (default: today).
 * - `latest`       — `"true"` to return only the most recent row.
 * - `interpolated` — `"true"` to linearly fill daily gaps.
 * - `isDomainId`   — `"true"` to treat `id` as a platform domain identifier.
 * - `extrapolated` — `"before"` | `"after"` | `"both"` to extend boundary values.
 *
 * @param request - Incoming Next.js request object.
 * @param params  - Route segment params containing `id`, `platform`, and `mode`.
 * @returns JSON response conforming to {@link TrackPlatformStatsResponse}.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string; platform: string; mode: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  try {
    const searchParams = request.nextUrl.searchParams;
    const validatedParams = validatePlatformStatsParams(
      params.id,
      params.platform,
      params.mode,
      searchParams,
    );
    const result = await getTrackPlatformStats(validatedParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
