/**
 * TikTok Typed Track Chart – service layer.
 * @module lib/charts/tiktok-track-types/service
 */

import {
  TikTokTypedTrackChartParams,
  TikTokTypedTrackChartRow,
} from './types';
import { queryTikTokTypedTrackChart } from './query';
import { normalizeTikTokTypedTrackChartRows } from './normalize';

/**
 * Response envelope for the TikTok typed track chart endpoint.
 */
export interface TikTokTypedTrackChartResponse {
  obj: TikTokTypedTrackChartRow[];
}

/**
 * Fetches and returns a paginated TikTok typed track chart snapshot.
 *
 * Delegates to the query layer then normalises the raw rows into the API
 * response shape.
 *
 * @param params - Validated chart parameters.
 * @returns The chart response object.
 */
export async function getTikTokTypedTrackChart(
  params: TikTokTypedTrackChartParams,
): Promise<TikTokTypedTrackChartResponse> {
  const raw = await queryTikTokTypedTrackChart(params);
  const obj = normalizeTikTokTypedTrackChartRows(raw);
  return { obj };
}
