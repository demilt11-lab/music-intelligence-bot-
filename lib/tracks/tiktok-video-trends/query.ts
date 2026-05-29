import { db } from '@/lib/db';

/**
 * Raw row shape returned by the TikTok video metrics query.
 * BigInt columns from PostgreSQL are typed as `bigint | null`.
 */
export interface RawTikTokVideoMetricRow {
  /** ISO date string (`YYYY-MM-DD`) for this observation. */
  date: string | Date;
  /** Total likes on this date. */
  likes: bigint | number | null;
  /** Total comments on this date. */
  comments: bigint | number | null;
  /** Total views on this date. */
  views: bigint | number | null;
}

/**
 * Fetches daily engagement metrics for a TikTok video from the
 * `tiktok_video_metrics_daily` table.
 *
 * Rows where `external_video_id = videoId` and `date >= since` are returned,
 * ordered by date ascending.
 *
 * @param videoId - TikTok platform-specific video identifier.
 * @param since   - ISO date string; inclusive lower bound on the observation date.
 * @returns Array of raw metric rows ordered by date ascending.
 */
export async function queryTikTokVideoTrends(
  videoId: string,
  since: string,
): Promise<RawTikTokVideoMetricRow[]> {
  return db.$queryRaw<RawTikTokVideoMetricRow[]>`
    SELECT
      date::text AS date,
      likes,
      comments,
      views
    FROM tiktok_video_metrics_daily
    WHERE external_video_id = ${videoId}
      AND date              >= ${since}::date
    ORDER BY date ASC
  `;
}
