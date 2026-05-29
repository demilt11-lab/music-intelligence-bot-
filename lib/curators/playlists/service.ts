/**
 * Curator playlists – service layer.
 * @module lib/curators/playlists/service
 */

import type { CuratorPlaylistsParams, CuratorPlaylistsResponse } from './types';
import { queryCuratorPlaylists } from './query';
import { normalizeCuratorPlaylistRow } from './normalize';

/**
 * Fetches and returns a paginated list of playlists belonging to a curator.
 *
 * Delegates raw data retrieval to {@link queryCuratorPlaylists} and transforms
 * each row into a typed {@link CuratorPlaylistRow} via
 * {@link normalizeCuratorPlaylistRow}.
 *
 * @param params - Validated curator playlists parameters.
 * @returns A {@link CuratorPlaylistsResponse} containing the current page,
 *          page length, and total count.
 */
export async function getCuratorPlaylists(
  params: CuratorPlaylistsParams,
): Promise<CuratorPlaylistsResponse> {
  const { data: rawRows, total } = await queryCuratorPlaylists(params);

  const data = rawRows.map(normalizeCuratorPlaylistRow);

  return {
    total_length: total,
    length: data.length,
    data,
  };
}
