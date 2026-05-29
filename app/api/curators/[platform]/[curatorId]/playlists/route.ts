/**
 * GET /api/curators/:platform/:curatorId/playlists
 *
 * Returns a paginated list of playlists belonging to a specific curator.
 *
 * Path parameters:
 * - `platform`  – One of 'spotify' | 'applemusic' | 'deezer'.
 * - `curatorId` – Positive integer curator ID.
 *
 * Query parameters:
 * - `offset`        (integer, >= 0)     – Default 0.
 * - `limit`         (integer, 1–10000)  – Default 50.
 * - `sortColumn`    (string)            – Platform-specific sort column.
 * - `sortOrderDesc` (boolean)           – Default true.
 * - `storefront`    (string)            – Optional ISO alpha-2 country code filter.
 *
 * Responses:
 * - `200` – `{ total_length: number; length: number; data: CuratorPlaylistRow[] }`
 * - `400` – Validation error (invalid platform, curatorId, pagination, sort).
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCuratorPlaylistsParams } from '@/lib/curators/playlists/validate';
import { getCuratorPlaylists } from '@/lib/curators/playlists/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for a curator's playlist list.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing `platform` and `curatorId` path segments.
 * @returns JSON success or error response.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string; curatorId: string } },
): Promise<NextResponse> {
  try {
    const playlistParams = validateCuratorPlaylistsParams(
      params.platform,
      params.curatorId,
      request.nextUrl.searchParams,
    );
    const result = await getCuratorPlaylists(playlistParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
