import { TikTokVideoChartParams, TikTokVideoChartResponse } from './types';
import { queryTikTokVideoChart } from './query';
import { normalizeTikTokVideoChartRows } from './normalize';

/**
 * Fetches and returns a paginated TikTok video chart snapshot.
 *
 * Delegates to the query layer then normalises the raw rows into the API
 * response shape.
 *
 * @param params - Validated chart parameters.
 * @returns The chart response object.
 */
export async function getTikTokVideoChart(
  params: TikTokVideoChartParams,
): Promise<TikTokVideoChartResponse> {
  const raw = await queryTikTokVideoChart(params);
  const data = normalizeTikTokVideoChartRows(raw);
  return { obj: { length: data.length, data } };
}
