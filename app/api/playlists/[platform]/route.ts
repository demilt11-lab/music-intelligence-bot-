/**
 * GET /api/playlists/:platform
 *
 * Returns a paginated directory of playlists for the given platform.
 * Accepts all filter and sort parameters described in PlaylistDirectoryParams.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePlaylistDirectoryParams } from '@/lib/playlists/list/validate';
import { getPlaylistDirectory } from '@/lib/playlists/list/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

interface RouteContext {
  params: Promise<{ platform: string }>;
}

/**
 * Handles GET requests for the playlist directory on a specific platform.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the platform path segment.
 */
export async function GET(request: NextRequest, props: RouteContext): Promise<NextResponse> {
  const params = await props.params;
  try {
    const { platform } = params;
    const searchParams = request.nextUrl.searchParams;
    const validatedParams = validatePlaylistDirectoryParams(platform, searchParams);
    const result = await getPlaylistDirectory(validatedParams);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
