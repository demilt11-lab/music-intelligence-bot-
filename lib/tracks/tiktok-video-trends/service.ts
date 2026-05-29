import { defaultSince } from '@/lib/shared/dates';
import { queryTikTokVideoTrends } from './query';
import { normalizeTikTokVideoTrends } from './normalize';
import { TikTokVideoTrendsParams, TikTokVideoTrendsResponse } from './types';

/**
 * Orchestrates the TikTok video trends data pipeline.
 *
 * 1. Derives the `since` date from `params.fromDaysAgo`.
 * 2. Delegates to {@link queryTikTokVideoTrends} for DB retrieval.
 * 3. Passes raw rows through {@link normalizeTikTokVideoTrends} for shaping.
 * 4. Wraps the result in the standard {@link TikTokVideoTrendsResponse}
 *    envelope.
 *
 * @param params - Validated parameters produced by
 *   {@link validateTikTokVideoTrendsParams}.
 * @returns A fully populated {@link TikTokVideoTrendsResponse}.
 */
export async function getTikTokVideoTrends(
  params: TikTokVideoTrendsParams,
): Promise<TikTokVideoTrendsResponse> {
  const since = defaultSince(params.fromDaysAgo);
  const rawRows = await queryTikTokVideoTrends(params.videoId, since);
  const obj = normalizeTikTokVideoTrends(rawRows);

  return { obj };
}
