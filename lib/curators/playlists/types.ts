/**
 * Type definitions for the Curator Playlists module.
 * @module lib/curators/playlists/types
 */

/** Platforms that support curator playlists. */
export type CuratorPlaylistPlatform = 'spotify' | 'applemusic' | 'deezer';

/** Exhaustive list of curator playlist platforms. */
export const CURATOR_PLAYLIST_PLATFORMS: readonly CuratorPlaylistPlatform[] = [
  'spotify',
  'applemusic',
  'deezer',
];

/** A tag attached to a curator playlist. */
export interface CuratorPlaylistTag {
  id: number;
  name: string;
}

/**
 * A single curator playlist row returned by the API.
 *
 * Fields that may exceed `Number.MAX_SAFE_INTEGER` (follower counts, diffs)
 * are typed as `string` for BigInt-safe serialisation.
 */
export interface CuratorPlaylistRow {
  playlistId: number;
  externalPlaylistId: string | null;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  /** ISO date string of the last system update. */
  sysLastUpdated: string | null;
  /** ISO date string of the last playlist update. */
  lastUpdated: string | null;
  personalized: boolean | null;
  code2: string | null;
  ownerName: string | null;
  ownerId: number | null;
  externalUserId: string | null;
  official: boolean | null;
  tags: CuratorPlaylistTag[];
  /** BigInt-safe follower count, serialised as a string. */
  followers: string | null;
  numTrack: number | null;
  /** BigInt-safe weekly follower diff, serialised as a string. */
  followerDiffWeek: string | null;
  /** BigInt-safe monthly follower diff, serialised as a string. */
  followerDiffMonth: string | null;
  catalog: number | null;
  activeRatio: number | null;
}

/** Paginated response for the curator playlists endpoint. */
export interface CuratorPlaylistsResponse {
  total_length: number;
  length: number;
  data: CuratorPlaylistRow[];
}

/** Validated parameters for querying a curator's playlists. */
export interface CuratorPlaylistsParams {
  platform: CuratorPlaylistPlatform;
  curatorId: number;
  storefront: string | undefined;
  limit: number;
  offset: number;
  sortColumn: string;
  sortOrderDesc: boolean;
}
