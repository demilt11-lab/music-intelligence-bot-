/**
 * Service layer for Playlist Tracks.
 * Orchestrates query execution and result normalisation.
 */

import type { PlaylistTracksParams, PlaylistTracksResponse } from './types';
import { queryPlaylistTracks } from './query';
import { normalizePlaylistTrack } from './normalize';

/**
 * Fetches the track membership list for a playlist.
 *
 * @param params - Validated playlist tracks parameters.
 * @returns A {@link PlaylistTracksResponse} with normalised track rows.
 */
export async function getPlaylistTracks(
  params: PlaylistTracksParams,
): Promise<PlaylistTracksResponse> {
  const raw = await queryPlaylistTracks(params);
  const obj = raw.map(normalizePlaylistTrack);
  return { obj };
}
