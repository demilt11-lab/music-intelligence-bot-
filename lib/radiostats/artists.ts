// lib/radiostats/artists.ts
import { radiostatsGet } from './client';

export type RadiostatsArtistQuery = {
  spotify_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type RadiostatsArtistStats = {
  artist_id?: string;
  spotify_id?: string;
  [key: string]: any;
};

export async function getRadiostatsArtistStats(
  query: RadiostatsArtistQuery,
): Promise<RadiostatsArtistStats> {
  if (!query.spotify_id) {
    throw new Error('spotify_id is required for artist stats');
  }

  return radiostatsGet<RadiostatsArtistStats>('/artists', query);
}
