/**
 * GET /api/charts/tiktok/users
 *
 * Returns a paginated TikTok user chart snapshot.
 *
 * Query parameters:
 * - `type`     (string, required)           – 'likes' | 'followers'.
 * - `interval` (string)                     – Chart time-window; default 'daily'.
 * - `date`     (string, YYYY-MM-DD)         – Required unless `latest=true`.
 * - `latest`   (boolean)                    – If true, uses the most recent snapshot.
 * - `limit`    (integer, 1–100)             – Default 50.
 * - `offset`   (integer, 0–9900)            – Default 0.
 *
 * Responses:
 * - `200` – `{ obj: { length: number; data: TikTokUserChartRow[] } }`
 * - `400` – Validation error.
 * - `500` – Unexpected server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateTikTokUserChartParams } from '@/lib/charts/tiktok-users/validate';
import { getTikTokUserChart } from '@/lib/charts/tiktok-users/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * Handles GET requests for the TikTok user chart.
 *
 * @param request - The incoming Next.js request.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = validateTikTokUserChartParams(request.nextUrl.searchParams);
    const result = await getTikTokUserChart(params);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
