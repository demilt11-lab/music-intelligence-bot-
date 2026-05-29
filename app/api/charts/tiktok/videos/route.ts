import { NextRequest, NextResponse } from 'next/server';
import { validateTikTokVideoChartParams } from '@/lib/charts/tiktok-videos/validate';
import { getTikTokVideoChart } from '@/lib/charts/tiktok-videos/service';
import { handleApiError } from '@/lib/shared/errors';
import { successResponse } from '@/lib/shared/response';

/**
 * GET /api/charts/tiktok/videos
 *
 * Returns a paginated TikTok video chart snapshot.
 *
 * Query parameters:
 * - `date`   (string, YYYY-MM-DD) – Required unless `latest=true`.
 * - `latest` (boolean)            – If true, uses the most recent snapshot.
 * - `limit`  (integer, 1–100)     – Default 50.
 * - `offset` (integer, 0–9900)    – Default 0.
 *
 * Responses:
 * - `200` – `{ obj: { length: number; data: TikTokVideoChartRow[] } }`
 * - `400` – Validation error.
 * - `500` – Unexpected server error.
 *
 * @param request - The incoming Next.js request.
 * @returns JSON success or error response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = validateTikTokVideoChartParams(request.nextUrl.searchParams);
    const result = await getTikTokVideoChart(params);
    return successResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
