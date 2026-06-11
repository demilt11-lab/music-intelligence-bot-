/**
 * GET /api/radio/:type/:id/airplay-totals
 *
 * Deprecated aggregate endpoint that returns airplay data across all four
 * dimensions (countries, cities, stations, tracks) in a single response.
 *
 * New consumers should prefer the canonical per-dimension endpoint:
 *   GET /api/radio/:type/:id/airplay-totals/:entity
 *
 * Path params:
 *   type - 'artist' | 'album' | 'track'
 *   id   - Numeric entity id
 *
 * Query params:
 *   since   - ISO date string (default: 180 days ago)
 *   station - Optional station id filter
 *   limit   - 1–100 per dimension (default 20)
 *
 * NOTE: In Next.js App Router, this route (`/airplay-totals/route.ts`) coexists
 * with the deeper route (`/airplay-totals/[entity]/route.ts`) without conflict
 * because the segment count differs — Next.js matches the more specific (longer)
 * route first.
 */

import { type NextRequest } from 'next/server';
import { validateAirplayTotalsParams } from '@/lib/radio/airplay-totals/validate';
import { getAirplayTotals } from '@/lib/radio/airplay-totals/service';
import { successResponse, handleApiError } from '@/lib/shared/response';

/**
 * Route handler for GET /api/radio/[type]/[id]/airplay-totals.
 *
 * @param req    - Incoming Next.js request.
 * @param params - Destructured path parameters from the dynamic route.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ type: string; id: string }> }) {
  const params = await props.params;
  try {
    const validated = validateAirplayTotalsParams(
      params.type,
      params.id,
      req.nextUrl.searchParams,
    );
    const data = await getAirplayTotals(validated);
    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}
