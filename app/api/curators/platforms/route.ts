/**
 * GET /api/curators/platforms
 *
 * Returns the list of supported curator platforms.
 *
 * Responses:
 * - `200` – `{ obj: CuratorPlatform[] }`
 * - `500` – Unexpected server error.
 */

import { NextResponse } from 'next/server';
import { CURATOR_PLATFORMS } from '@/lib/curators/list/types';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for the supported curator platforms list.
 *
 * @returns JSON response containing all supported platform identifiers.
 */
export async function GET(): Promise<NextResponse> {
  try {
    return successResponse({ obj: CURATOR_PLATFORMS });
  } catch (err) {
    return handleApiError(err);
  }
}
