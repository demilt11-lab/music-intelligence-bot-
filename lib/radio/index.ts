export * from './airplay-totals/service';
export * from './broadcast-markets/service';
export * from './stations/service';

import { getAirplayTotals } from './airplay-totals/service';
import { getBroadcastMarkets } from './broadcast-markets/service';
import type { AirplayTotalsParams } from './airplay-totals/types';

export const radioService = {
  getTrackAirplayTotals: (params: AirplayTotalsParams) => getAirplayTotals(params),
  getTrackBroadcastMarkets: getBroadcastMarkets,
};
