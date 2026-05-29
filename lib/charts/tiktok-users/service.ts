/**
 * TikTok User Chart – service layer.
 * @module lib/charts/tiktok-users/service
 */

import { TikTokUserChartParams, TikTokUserChartResponse } from './types';
import { queryTikTokUserChart } from './query';
import { normalizeTikTokUserChartRows } from './normalize';

/**
 * Fetches and returns a paginated TikTok user chart snapshot.
 *
 * Delegates to the query layer then normalises the raw rows into the API
 * response shape.
 *
 * @param params - Validated chart parameters.
 * @returns The chart response object.
 */
export async function getTikTokUserChart(
  params: TikTokUserChartParams,
): Promise<TikTokUserChartResponse> {
  const raw = await queryTikTokUserChart(params);
  const data = normalizeTikTokUserChartRows(raw, params.type, params.interval);
  return { obj: { length: data.length, data } };
}
