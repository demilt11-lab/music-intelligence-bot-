/**
 * GET /api/curators/:platform
 *
 * Returns a paginated, filtered list of curators for the given platform.
 *
 * Path parameters:
 * - `platform` – One of 'spotify' | 'applemusic' | 'itunes' | 'deezer' | 'youtube' | 'amazon'.
 *
 * Query parameters:
 * - `offset`                (integer, >= 0)          – Default 0.
 * - `limit`                 (integer, 1–10000)        – Default 50.
 * - `sortColumn`            (string)                  – Platform-specific sort column.
 * - `sortOrderDesc`         (boolean)                 – Default true.
 * - `shortlistIds`          (comma-separated ints)    – Filter to specific curator IDs.
 * - `nameSearch`            (string)                  – ILIKE filter on owner name.
 * - `playlistKeywordSearch` (string)                  – Filter by playlist name keyword.
 * - `withSocialUrls`        (boolean, spotify only)   – Default false.
 * - `editorial`             (boolean)                 – Filter by editorial flag.
 * - `majorLabel`            (boolean, platform-specific) – Filter by major label flag.
 * - `brand`                 (boolean, platform-specific) – Filter by brand flag.
 * - `popularIndie`          (boolean, platform-specific) – Filter by popular indie flag.
 * - `indie`                 (boolean, platform-specific) – Filter by indie flag.
 * - `audiobook`             (boolean)                 – Filter by audiobook flag.
 * - `code2`                 (string, youtube only)    – ISO alpha-2 country filter.
 *
 * Responses:
 * - `200` – `{ obj: CuratorRow[]; offset: number; total: number }`
 * - `400` – Validation error.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCuratorListParams } from '@/lib/curators/list/validate';
import { getCuratorList } from '@/lib/curators/list/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for the curator list endpoint.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the `platform` path segment.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ platform: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const listParams = validateCuratorListParams(
      params.platform,
      request.nextUrl.searchParams,
    );
    const result = await getCuratorList(listParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
