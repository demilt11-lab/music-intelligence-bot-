/**
 * Types for the Playlist Directory module.
 */

export type PlaylistPlatform = 'spotify' | 'applemusic' | 'itunes' | 'deezer' | 'youtube' | 'amazon';

export const PLAYLIST_PLATFORMS: readonly PlaylistPlatform[] = [
  'spotify',
  'applemusic',
  'itunes',
  'deezer',
  'youtube',
  'amazon',
];

/** A tag associated with a playlist. */
export interface PlaylistTag {
  id: number;
  name: string;
}

/** A single row returned from the playlist directory query. */
export interface PlaylistDirectoryRow {
  position: number;
  playlistId: number;
  externalPlaylistId: string | null;
  code2: string | null;
  name: string | null;
  imageUrl: string | null;
  personalized: boolean | null;
  lastUpdated: string | null;
  ownerName: string | null;
  ownerId: number | null;
  externalUserId: string | null;
  editorial: boolean | null;
  topPlaylist: boolean | null;
  followers: string | null;
  views: string | null;
  latest: boolean | null;
  numTrack: number | null;
  followerDiffWeek: string | null;
  followerDiffPercentWeek: number | null;
  followerDiffMonth: string | null;
  followerDiffPercentMonth: number | null;
  viewDiffWeek: string | null;
  viewDiffMonth: string | null;
  monthlyDiff: string | null;
  catalog: number | null;
  activeRatio: number | null;
  genre: string | null;
  tags: PlaylistTag[];
  rank: number | null;
}

/** The full response envelope for the playlist directory endpoint. */
export interface PlaylistDirectoryResponse {
  obj: PlaylistDirectoryRow[];
  offset: number;
  total: number;
}

/** Validated, normalised query parameters for the playlist directory. */
export interface PlaylistDirectoryParams {
  platform: PlaylistPlatform;
  offset: number;
  limit: number;
  tagIds: number[];
  sortColumn: string;
  sortOrderDesc: boolean;
  code2: string | undefined;
  editorial: boolean | undefined;
  topPlaylist: boolean | undefined;
  descriptionSearch: string | undefined;
  shortlistIds: number[];
  // Platform-specific filters
  curatorIds: number[];
  excludedCuratorIds: number[];
  indie: boolean | undefined;
  majorCurator: boolean | undefined;
  newMusicFriday: boolean | undefined;
}
