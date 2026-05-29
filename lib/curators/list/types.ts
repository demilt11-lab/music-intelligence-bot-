/**
 * Supported curator platforms.
 */
export type CuratorPlatform =
  | 'spotify'
  | 'applemusic'
  | 'itunes'
  | 'deezer'
  | 'youtube'
  | 'amazon';

/** Exhaustive list of supported curator platforms. */
export const CURATOR_PLATFORMS: readonly CuratorPlatform[] = [
  'spotify',
  'applemusic',
  'itunes',
  'deezer',
  'youtube',
  'amazon',
];

/**
 * A single curator row returned in the list response.
 * Numeric fields that may exceed Number.MAX_SAFE_INTEGER are typed as `string`
 * to safely transport BigInt values from the database.
 */
export interface CuratorRow {
  position: number;
  curatorId: number;
  platform: CuratorPlatform;
  externalOwnerId: string | null;
  ownerName: string | null;
  imageUrl: string | null;
  numPlaylists: number | null;
  /** BigInt-safe total reach, serialised as a string. */
  totalReach: string | null;
  /** BigInt-safe follower count, serialised as a string. */
  followers: string | null;
  followerDiffMonth: string | null;
  followerDiffPercentMonth: number | null;
  tags: string[];
  numUpdates: number | null;
  numTracksUpdated: number | null;
  editorial: boolean | null;
  majorLabel: boolean | null;
  brand: boolean | null;
  popularIndie: boolean | null;
  indie: boolean | null;
  audiobook: boolean | null;
}

/** Paginated response for the curator list endpoint. */
export interface CuratorListResponse {
  obj: CuratorRow[];
  offset: number;
  total: number;
}

/** Validated parameters for querying the curator list. */
export interface CuratorListParams {
  platform: CuratorPlatform;
  offset: number;
  limit: number;
  sortColumn: string;
  sortOrderDesc: boolean;
  shortlistIds: number[];
  nameSearch: string | undefined;
  playlistKeywordSearch: string | undefined;
  withSocialUrls: boolean;
  editorial: boolean | undefined;
  majorLabel: boolean | undefined;
  brand: boolean | undefined;
  popularIndie: boolean | undefined;
  indie: boolean | undefined;
  audiobook: boolean | undefined;
  code2: string | undefined;
}
