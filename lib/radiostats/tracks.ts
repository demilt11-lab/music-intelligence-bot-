// lib/radiostats/tracks.ts
import { radiostatsGet } from './client';

export type RadiostatsTrackQuery = {
  isrc?: string;
  spotify_id?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  page?: number;
  limit?: number;
};

// Shape will be refined once you inspect actual JSON
export type RadiostatsTrackStats = {
  track_id?: string;
  isrc?: string;
  spotify_id?: string;
  // e.g. stations_count, plays, audience, history, etc.
  [key: string]: any;
};

export async function getRadiostatsTrackStats(
  query: RadiostatsTrackQuery,
): Promise<RadiostatsTrackStats> {
  if (!query.isrc && !query.spotify_id) {
    throw new Error('Either isrc or spotify_id is required');
  }

  return radiostatsGet<RadiostatsTrackStats>('/tracks', query);
}
