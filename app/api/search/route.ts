import { NextRequest, NextResponse } from 'next/server';
import { validateSearchParams } from '@/lib/search/validate';
import { search } from '@/lib/search/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';
import { enforceKeyedRateLimit } from '@/lib/platform/rate-limit';

// This route is intentionally public (no session/API key) and DB-heavy on
// every call, so it's rate-limited by IP rather than by tenant.
const MAX_REQUESTS_PER_MINUTE = 60;

/**
 * GET /api/search
 *
 * Full-text search across all entity types (artists, tracks, playlists,
 * curators, albums, stations, cities, songwriters).
 *
 * Query parameters:
 * - `q`                (required) Search term, max 100 characters.
 * - `limit`            (optional) Results per entity type, 1–100. Default 20.
 * - `offset`           (optional) Skip N results. Default 0.
 * - `type`             (optional) Entity type filter. Default "all".
 * - `beta`             (optional) When true, returns a flat suggestions list.
 * - `platforms`        (optional, beta only) Platform filter, comma-separated.
 * - `triggerCitiesOnly`(optional) When true, restricts cities to trigger cities.
 *
 * @param request - The incoming Next.js request.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    try {
      await enforceKeyedRateLimit(ip, 'public:search', MAX_REQUESTS_PER_MINUTE);
    } catch (err: any) {
      if (err?.status === 429) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      throw err;
    }

    const params = validateSearchParams(request.nextUrl.searchParams);
    const result = await search(params);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
