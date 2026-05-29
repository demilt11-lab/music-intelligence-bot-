/**
 * GET /api/charts/youtube/countries
 *
 * Returns all country codes for which at least one YouTube Shorts chart
 * snapshot exists. Includes the special value 'GLOBAL' when applicable.
 *
 * Responses:
 * - `200` – `{ obj: string[] }` – Sorted array of country code strings.
 * - `500` – Unexpected server error.
 */

import { NextResponse } from 'next/server';
import { queryYouTubeShortsCountries } from '@/lib/charts/youtube-shorts/query';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for available YouTube Shorts chart countries.
 *
 * @returns JSON success or error response.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const countries = await queryYouTubeShortsCountries();
    return successResponse({ obj: countries });
  } catch (err) {
    return handleApiError(err);
  }
}
