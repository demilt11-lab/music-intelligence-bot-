import { queryPlatformStats } from './query';
import { normalizePlatformStats } from './normalize';
import {
  TrackPlatformStatsParams,
  TrackPlatformStatsResponse,
} from './types';

/**
 * Orchestrates the platform-stats data pipeline for a single track.
 *
 * 1. Delegates to {@link queryPlatformStats} to fetch raw rows from the DB.
 * 2. Passes the rows through {@link normalizePlatformStats} for shaping,
 *    interpolation, and optional extrapolation.
 * 3. Wraps the result in the standard {@link TrackPlatformStatsResponse}
 *    envelope.
 *
 * @param params - Validated query parameters produced by
 *   {@link validatePlatformStatsParams}.
 * @returns A fully populated {@link TrackPlatformStatsResponse}.
 */
export async function getTrackPlatformStats(
  params: TrackPlatformStatsParams,
): Promise<TrackPlatformStatsResponse> {
  const rawRows = await queryPlatformStats(params);
  const obj = normalizePlatformStats(rawRows, params);

  return { obj };
}
