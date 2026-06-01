/**
 * @module app/api/charts/airplay/tracks/dates/route
 *
 * GET /api/charts/airplay/tracks/dates
 *
 * Returns all available snapshot dates for a given duration and country,
 * sorted descending (most recent first).
 *
 * Query parameters:
 *   - `duration`      {AirplayDuration}  required
 *   - `country_code`  {string}           ISO alpha-2 or "GLOBAL" (default)
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAvailableAirplayDates } from '@/lib/charts/airplay-tracks/query';
import { AirplayDuration } from '@/lib/charts/airplay-tracks/types';

/** All valid duration values — kept in sync with the type. */
const VALID_DURATIONS: ReadonlySet<string> = new Set<AirplayDuration>([
  'daily',
  'weekly',
  'monthly',
  'semi_yearly',
  'yearly',
  'all_time',
]);

/**
 * Handles GET requests for available airplay chart dates.
 *
 * @param request - Incoming Next.js request.
 * @returns `{ obj: string[] }` — array of YYYY-MM-DD date strings.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    const rawDuration = searchParams.get('duration');
    if (!rawDuration || !VALID_DURATIONS.has(rawDuration)) {
      return NextResponse.json(
        {
          error: `"duration" is required and must be one of: ${Array.from(VALID_DURATIONS).join(', ')}.`,
        },
        { status: 400 },
      );
    }
    const duration = rawDuration as AirplayDuration;

    const rawCountry = searchParams.get('country_code');
    const countryCode =
      rawCountry && rawCountry.trim() !== '' ? rawCountry.trim().toUpperCase() : 'GLOBAL';

    const dates = await queryAvailableAirplayDates(duration, countryCode);
    return NextResponse.json({ obj: dates });
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Internal server error';
    return NextResponse.json({ error: message }, { status });
  }
}
