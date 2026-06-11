/**
 * GET /api/radio/:type/:id/airplay-totals/:entity
 *
 * Returns airplay data for the given entity (artist/album/track) broken down by
 * country, city, station, or track.
 *
 * Path params:
 *   type   - 'artist' | 'album' | 'track'
 *   id     - Numeric entity id
 *   entity - 'country' | 'city' | 'station' | 'track'
 *
 * Query params:
 *   since      - ISO date string (default: 180 days ago)
 *   station    - Optional station id filter
 *   limit      - 1–100 (default 20)
 *   dateFormat - 'ISO' | 'UNIX' (default 'ISO')
 */

import { type NextRequest } from 'next/server';
import { validateAirplayByEntityParams } from '@/lib/radio/airplay-by-entity/validate';
import { getAirplayByEntity } from '@/lib/radio/airplay-by-entity/service';
import { successResponse, handleApiError } from '@/lib/shared/response';

/**
 * Route handler for GET /api/radio/[type]/[id]/airplay-totals/[entity].
 *
 * @param req    - Incoming Next.js request.
 * @param params - Destructured path parameters from the dynamic route.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ type: string; id: string; entity: string }> }
) {
  const params = await props.params;
  try {
    const validated = validateAirplayByEntityParams(
      params.type,
      params.id,
      params.entity,
      req.nextUrl.searchParams,
    );
    const data = await getAirplayByEntity(validated);
    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}
