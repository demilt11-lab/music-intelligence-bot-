/**
 * @module app/api/charts/airplay/tracks/route
 *
 * GET /api/charts/airplay/tracks
 *
 * Returns the airplay track chart for a given duration, country, and date.
 *
 * Query parameters:
 *   - `duration`      {AirplayDuration}  required
 *   - `date`          {string}           optional YYYY-MM-DD
 *   - `since`         {string}           optional YYYY-MM-DD lower bound
 *   - `limit`         {number}           1–500, default 50
 *   - `country_code`  {string}           ISO alpha-2 or "GLOBAL" (default)
 *   - `city_id`       {number}           optional positive integer
 *   - `latest`        {boolean}          default false
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAirplayTrackChartParams } from '@/lib/charts/airplay-tracks/validate';
import { getAirplayTrackChart } from '@/lib/charts/airplay-tracks/service';

/**
 * Handles GET requests for the airplay track chart.
 *
 * @param request - Incoming Next.js request.
 * @returns JSON response wrapped in the standard `{ obj }` envelope.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = validateAirplayTrackChartParams(request.nextUrl.searchParams);
    const response = await getAirplayTrackChart(params);
    return NextResponse.json(response);
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Internal server error';
    return NextResponse.json({ error: message }, { status });
  }
}
