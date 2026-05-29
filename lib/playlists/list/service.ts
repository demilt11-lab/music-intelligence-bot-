/**
 * Service layer for the Playlist Directory.
 * Orchestrates query execution and result normalization.
 */

import type { PlaylistDirectoryParams, PlaylistDirectoryResponse } from './types';
import { queryPlaylistDirectory } from './query';
import { normalizePlaylistDirectoryRow } from './normalize';

/**
 * Fetches a page of playlists from the directory for the given platform.
 *
 * @param params - Validated query parameters.
 * @returns A paginated {@link PlaylistDirectoryResponse}.
 */
export async function getPlaylistDirectory(
  params: PlaylistDirectoryParams,
): Promise<PlaylistDirectoryResponse> {
  const { data, total } = await queryPlaylistDirectory(params);

  const obj = data.map((row, index) =>
    normalizePlaylistDirectoryRow(row, params.offset + index + 1),
  );

  return {
    obj,
    offset: params.offset,
    total,
  };
}
