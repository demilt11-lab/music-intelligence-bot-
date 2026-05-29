import { NextRequest, NextResponse } from 'next/server';
import { validateTrackId } from '@/lib/tracks/metadata/validate';
import { getTrackMetadata } from '@/lib/tracks/metadata/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/tracks/[trackId]
 *
 * Returns full metadata for a single track identified by its integer ID.
 *
 * Path parameters:
 * - `trackId` (required) A positive integer track identifier.
 *
 * Responses:
 * - `200` – Track metadata payload.
 * - `400` – `trackId` is missing or not a valid positive integer.
 * - `404` – No track found for the given ID.
 * - `500` – Unexpected server error.
 *
 * @param request - The incoming Next.js request.
 * @param context - Route context containing the dynamic `trackId` param.
 * @returns JSON success or error response.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { trackId: string } },
): Promise<NextResponse> {
  try {
    const trackId = validateTrackId(params.trackId);
    const result = await getTrackMetadata(trackId);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
