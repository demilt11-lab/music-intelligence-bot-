/**
 * GET /api/radio/:type/:id/broadcast-markets
 *
 * Returns country- and city-level broadcast market ratios for the given entity,
 * showing where it receives the most airplay relative to the total play volume.
 *
 * Path params:
 *   type - 'artist' | 'album' | 'track'
 *   id   - Numeric entity id
 *
 * Query params:
 *   since - ISO date string (default: 180 days ago)
 */

import { type NextRequest } from 'next/server';
import { validateBroadcastMarketsParams } from '@/lib/radio/broadcast-markets/validate';
import { getBroadcastMarkets } from '@/lib/radio/broadcast-markets/service';
import { successResponse, handleApiError } from '@/lib/shared/response';

/**
 * Route handler for GET /api/radio/[type]/[id]/broadcast-markets.
 *
 * @param req    - Incoming Next.js request.
 * @param params - Destructured path parameters from the dynamic route.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ type: string; id: string }> }) {
  const params = await props.params;
  try {
    const validated = validateBroadcastMarketsParams(
      params.type,
      params.id,
      req.nextUrl.searchParams,
    );
    const data = await getBroadcastMarkets(validated);
    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}
