/**
 * @module app/api/charts/airplay/countries/route
 *
 * GET /api/charts/airplay/countries
 *
 * Returns every country (code + display name) that has at least one airplay
 * chart snapshot in the database, sorted alphabetically by name.
 *
 * Response shape:
 * ```json
 * { "obj": [{ "code2": "US", "name": "United States" }, ...] }
 * ```
 */

import { NextResponse } from 'next/server';
import { queryAirplayCountries } from '@/lib/charts/airplay-tracks/query';

/**
 * Handles GET requests for available airplay chart countries.
 *
 * @param _request - Incoming Next.js request (no query parameters required).
 * @returns `{ obj: Array<{ code2: string; name: string }> }`
 */
export async function GET(): Promise<NextResponse> {
  try {
    const countries = await queryAirplayCountries();
    return NextResponse.json({ obj: countries });
  } catch (error: any) {
    const status = error?.status ?? 500;
    const message = error?.message ?? 'Internal server error';
    return NextResponse.json({ error: message }, { status });
  }
}
