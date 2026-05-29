/**
 * Entity type options for search queries.
 */
export type SearchEntityType =
  | 'all'
  | 'artists'
  | 'tracks'
  | 'playlists'
  | 'curators'
  | 'albums'
  | 'stations'
  | 'cities'
  | 'songwriters';

/** All valid SearchEntityType values as a readonly tuple for runtime validation. */
export const SEARCH_ENTITY_TYPES = [
  'all',
  'artists',
  'tracks',
  'playlists',
  'curators',
  'albums',
  'stations',
  'cities',
  'songwriters',
] as const satisfies readonly SearchEntityType[];

/** A matched artist from a search query. */
export interface SearchArtistResult {
  id: number;
  name: string;
  imageUrl: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  code2: string | null;
  spotifyFollowers: number | null;
  /** Relevance score, higher is more relevant. */
  score: number | null;
}

/** A matched track from a search query. */
export interface SearchTrackResult {
  id: number;
  name: string;
  isrc: string | null;
  imageUrl: string | null;
  artists: Array<{ id: number; name: string }>;
  releaseDate: string | null;
  /** Relevance score, higher is more relevant. */
  score: number | null;
}

/** A matched playlist from a search query. */
export interface SearchPlaylistResult {
  id: number;
  name: string;
  imageUrl: string | null;
  platform: string;
  /** Follower count serialised as a string to preserve bigint precision. */
  followers: string | null;
  ownerName: string | null;
}

/** A matched playlist curator from a search query. */
export interface SearchCuratorResult {
  id: number;
  name: string;
  imageUrl: string | null;
  platform: string;
  numPlaylists: number | null;
}

/** A matched album from a search query. */
export interface SearchAlbumResult {
  id: number;
  name: string;
  imageUrl: string | null;
  upc: string | null;
  releaseDate: string | null;
  artists: Array<{ id: number; name: string }>;
}

/** A matched radio station from a search query. */
export interface SearchStationResult {
  id: number;
  name: string;
  country: string | null;
  genre: string | null;
  imageUrl: string | null;
}

/** A matched city from a search query. */
export interface SearchCityResult {
  id: number;
  name: string;
  code2: string | null;
  country: string | null;
  isTrigger: boolean;
}

/** A matched songwriter from a search query. */
export interface SearchSongwriterResult {
  id: number;
  name: string;
  imageUrl: string | null;
}

/** Grouped results for a standard (non-beta) search response. */
export interface SearchGroupedResults {
  artists?: SearchArtistResult[];
  tracks?: SearchTrackResult[];
  playlists?: SearchPlaylistResult[];
  curators?: SearchCuratorResult[];
  albums?: SearchAlbumResult[];
  stations?: SearchStationResult[];
  cities?: SearchCityResult[];
  songwriters?: SearchSongwriterResult[];
}

/** A single autocomplete suggestion returned by the beta search endpoint. */
export interface SearchSuggestion {
  type: SearchEntityType;
  id: number;
  name: string;
  imageUrl: string | null;
  /** Secondary display text (e.g. artist name for a track, platform for a playlist). */
  subtitle: string | null;
  /** Platforms on which this entity has a presence. */
  platforms: string[];
}

/** Validated and normalised search query parameters. */
export interface SearchParams {
  q: string;
  limit: number;
  offset: number;
  type: SearchEntityType;
  beta: boolean;
  /** Platform filter — only meaningful when beta=true. */
  platforms: string[];
  triggerCitiesOnly: boolean;
}

/** Response envelope for a standard search. */
export interface SearchNormalResponse {
  obj: SearchGroupedResults;
}

/** Response envelope for a beta (suggestions) search. */
export interface SearchBetaResponse {
  obj: { suggestions: SearchSuggestion[] };
}
