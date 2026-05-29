import { NextResponse } from 'next/server';
import { queryAvailableTikTokVideoDates } from '@/lib/charts/tiktok-videos/query';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/charts/tiktok/videos/dates
 *
 * Returns all chart dates for which TikTok video snapshots exist, sorted
 * newest-first.
 *
 * Responses:
 * - `200` – `{ obj: string[] }` – Array of YYYY-MM-DD date strings.
 * - `500` – Unexpected server error.
 *
 * @returns JSON success or error response.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const dates = await queryAvailableTikTokVideoDates();
    return successResponse({ obj: dates });
  } catch (err) {
    return handleApiError(err);
  }
}
