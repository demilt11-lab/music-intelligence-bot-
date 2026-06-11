/**
 * GET /api/playlists/:platform/filters
 *
 * Returns the filter and sort capabilities for the given playlist platform.
 * Clients can use this to build dynamic filter UIs without hardcoding platform rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PLAYLIST_PLATFORMS } from '@/lib/playlists/list/types';
import type { PlaylistPlatform } from '@/lib/playlists/list/types';
import { getPlaylistPlatformConfig } from '@/lib/playlists/list/platform-config';
import { badRequest, handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

interface RouteContext {
  params: Promise<{ platform: string }>;
}

/**
 * Returns the filter and sort configuration for a given platform.
 *
 * Response includes:
 * - `defaultSort` – the default sort column.
 * - `allowedSorts` – list of valid sort column values.
 * - Capability flags (`supportsCode2`, `supportsCuratorIds`, etc.)
 *
 * @param _request - The incoming Next.js request (unused).
 * @param context  - Route context containing the platform path segment.
 */
export async function GET(_request: NextRequest, props: RouteContext): Promise<NextResponse> {
  const params = await props.params;
  try {
    const { platform } = params;
    if (!PLAYLIST_PLATFORMS.includes(platform as PlaylistPlatform)) {
      throw badRequest(
        `Invalid platform "${platform}". Must be one of: ${PLAYLIST_PLATFORMS.join(', ')}`,
      );
    }

    const config = getPlaylistPlatformConfig(platform as PlaylistPlatform);
    return successResponse({ platform, ...config });
  } catch (err) {
    return handleApiError(err);
  }
}
