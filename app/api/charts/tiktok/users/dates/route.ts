/**
 * GET /api/charts/tiktok/users/dates
 *
 * Returns all chart dates for which TikTok user snapshots exist for a given
 * metric type, sorted newest-first.
 *
 * Query parameters:
 * - `type` (string, required) – 'likes' | 'followers'.
 *
 * Responses:
 * - `200` – `{ obj: string[] }` – Array of YYYY-MM-DD date strings.
 * - `400` – Missing or invalid `type` parameter.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseEnum } from '@/lib/shared/validation';
import { queryAvailableTikTokUserDates } from '@/lib/charts/tiktok-users/query';
import { TikTokUserChartType } from '@/lib/charts/tiktok-users/types';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

const CHART_TYPES: readonly TikTokUserChartType[] = ['likes', 'followers'] as const;

/**
 * Handles GET requests for available TikTok user chart dates.
 *
 * @param request - The incoming Next.js request.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const type = parseEnum(
      request.nextUrl.searchParams.get('type'),
      CHART_TYPES,
      'type',
    );
    const dates = await queryAvailableTikTokUserDates(type);
    return successResponse({ obj: dates });
  } catch (err) {
    return handleApiError(err);
  }
}
