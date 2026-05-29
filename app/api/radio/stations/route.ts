/**
 * GET /api/radio/stations?code2=US
 *
 * Returns radio stations for the specified country.
 */

import { type NextRequest } from 'next/server';
import { validateRadioStationsParams } from '@/lib/radio/stations/validate';
import { getRadioStations } from '@/lib/radio/stations/service';
import { successResponse } from '@/lib/shared/response';
import { handleApiError } from '@/lib/shared/errors';

/**
 * Handles GET /api/radio/stations.
 *
 * @param req - Incoming Next.js request.
 * @returns JSON response with a list of radio stations or an error payload.
 */
export async function GET(req: NextRequest) {
  try {
    const params = validateRadioStationsParams(req.nextUrl.searchParams);
    const data = await getRadioStations(params);
    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}
