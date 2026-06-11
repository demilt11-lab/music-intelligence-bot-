/**
 * GET /api/curators/:platform/filters
 *
 * Returns the available sort columns and supported filter flags for the given
 * curator platform.
 *
 * Path parameters:
 * - `platform` – One of 'spotify' | 'applemusic' | 'itunes' | 'deezer' | 'youtube' | 'amazon'.
 *
 * Responses:
 * - `200` – Platform filter/sort configuration object.
 * - `400` – Unknown platform.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCuratorPlatformConfig,
} from '@/lib/curators/list/platform-config';
import { CURATOR_PLATFORMS, type CuratorPlatform } from '@/lib/curators/list/types';
import { handleApiError } from '@/lib/shared/errors';
import { badRequest } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for curator platform filter/sort metadata.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the `platform` path segment.
 * @returns JSON response with available sorts and supported filters for the platform.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { platform: string } },
): Promise<NextResponse> {
  try {
    if (!CURATOR_PLATFORMS.includes(params.platform as CuratorPlatform)) {
      throw badRequest(
        `Unknown platform "${params.platform}". Allowed values: ${CURATOR_PLATFORMS.join(', ')}.`,
      );
    }

    const config = getCuratorPlatformConfig(params.platform as CuratorPlatform);

    return successResponse({
      platform: params.platform,
      defaultSort: config.defaultSort,
      allowedSorts: config.allowedSorts,
      supportsCode2: config.supportsCode2,
      supportsMajorLabel: config.supportsMajorLabel,
      supportsBrand: config.supportsBrand,
      supportsPopularIndie: config.supportsPopularIndie,
      supportsIndie: config.supportsIndie,
      supportsWithSocialUrls: config.supportsWithSocialUrls,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
