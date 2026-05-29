/**
 * GET /api/playlists/:platform/tags
 *
 * Returns all tags that are applied to at least one playlist on the given platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PLAYLIST_PLATFORMS } from '@/lib/playlists/list/types';
import type { PlaylistPlatform } from '@/lib/playlists/list/types';
import { db } from '@/lib/db';
import { badRequest, handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

interface RouteContext {
  params: { platform: string };
}

/**
 * Returns all tags available for playlists on the requested platform.
 *
 * @param _request - The incoming Next.js request (unused).
 * @param context  - Route context containing the platform path segment.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { platform } = params;
    if (!PLAYLIST_PLATFORMS.includes(platform as PlaylistPlatform)) {
      throw badRequest(
        `Invalid platform "${platform}". Must be one of: ${PLAYLIST_PLATFORMS.join(', ')}`,
      );
    }

    const tags = await db.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT DISTINCT t.id, t.name
      FROM tags t
      JOIN playlist_tags pt ON pt.tag_id = t.id
      JOIN playlists p ON p.id = pt.playlist_id
      WHERE p.platform = ${platform}
      ORDER BY t.name ASC
    `;

    return successResponse({ obj: tags });
  } catch (err) {
    return handleApiError(err);
  }
}
