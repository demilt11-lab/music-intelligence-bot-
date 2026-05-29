/**
 * Service layer for the Broadcast Markets module.
 */

import { queryBroadcastMarkets } from './query';
import { normalizeBroadcastMarkets } from './normalize';
import type { BroadcastMarketsParams, BroadcastMarketsResponse } from './types';

/**
 * Retrieves broadcast market ratios for the given entity across both country and
 * city dimensions.
 *
 * @param params - Validated {@link BroadcastMarketsParams}.
 * @returns Normalized {@link BroadcastMarketsResponse}.
 */
export async function getBroadcastMarkets(
  params: BroadcastMarketsParams,
): Promise<BroadcastMarketsResponse> {
  const raw = await queryBroadcastMarkets(params);
  return normalizeBroadcastMarkets(raw);
}
