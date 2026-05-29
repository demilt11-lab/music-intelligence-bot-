/**
 * YouTube Shorts Chart – service layer.
 * @module lib/charts/youtube-shorts/service
 */

import { YouTubeShortsChartParams, YouTubeShortsChartRow } from './types';
import { queryYouTubeShortsChart } from './query';
import { normalizeYouTubeShortsChartRows } from './normalize';

/**
 * Response envelope for the YouTube Shorts chart endpoint.
 */
export interface YouTubeShortsChartResponse {
  obj: { length: number; data: YouTubeShortsChartRow[] };
}

/**
 * Fetches and returns a paginated YouTube Shorts chart snapshot.
 *
 * Delegates to the query layer then normalises the raw rows into the API
 * response shape.
 *
 * @param params - Validated chart parameters.
 * @returns The chart response object.
 */
export async function getYouTubeShortsChart(
  params: YouTubeShortsChartParams,
): Promise<YouTubeShortsChartResponse> {
  const raw = await queryYouTubeShortsChart(params);
  const data = normalizeYouTubeShortsChartRows(raw);
  return { obj: { length: data.length, data } };
}
