/**
 * @module app/api/charts/airplay/cities/route
 *
 * GET /api/charts/airplay/cities?code2=US
 *
 * Returns all cities that have airplay chart coverage for the requested
 * country, sorted alphabetically by city name.
 *
 * Query parameters:
 *   - `code2` {string} required — ISO alpha-2 country code or "GLOBAL".
 *
 * Response shape:
 * ```json
 * { "obj": [{ "id": 123, "name": "New York", "code2": "US" }, ...] }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAirplayCities } from '@/lib/charts/airplay-tracks/query';

/**
 * Handles GET requests for cities with airplay chart coverage.
 *
 * @param request - Incoming Next.js request.
 * @returns `{ obj: Array<{ id: number; name: string; code2: string }> }`
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rawCode2 = request.nextUrl.searchParams.get('code2');

    if (!rawCode2 || rawCode2.trim() === '') {
      return NextResponse.json(
        { error: '"code2" query parameter is required.' },
        { status: 400 },
      );
    }

    const countryCode = rawCode2.trim().toUpperCase();

    const cities = await queryAirplayCities(countryCode);
    return NextResponse.json({ obj: cities });
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Internal server error';
    return NextResponse.json({ error: message }, { status });
  }
}
