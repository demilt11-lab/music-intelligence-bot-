import { notFound } from '@/lib/shared/errors';
import { queryTrack } from './query';
import { normalizeTrackMetadata } from './normalize';
import { TrackMetadataResponse } from './types';

/**
 * Retrieves and normalises full metadata for a single track.
 *
 * @param trackId - The integer primary key of the track to fetch.
 * @returns A {@link TrackMetadataResponse} envelope containing the normalised
 *   track metadata.
 * @throws {ApiError} 404 when no track with the given ID exists.
 */
export async function getTrackMetadata(
  trackId: number,
): Promise<TrackMetadataResponse> {
  const row = await queryTrack(trackId);

  if (row === null) {
    throw notFound(`Track with id ${trackId} was not found.`);
  }

  const metadata = normalizeTrackMetadata(row);

  return { obj: metadata };
}
