import {
  SearchParams,
  SearchNormalResponse,
  SearchBetaResponse,
  SearchGroupedResults,
  SearchSuggestion,
} from './types';
import {
  queryArtists,
  queryTracks,
  queryPlaylists,
  queryCurators,
  queryAlbums,
  queryStations,
  queryCities,
  querySongwriters,
} from './query';
import {
  normalizeArtist,
  normalizeTrack,
  normalizePlaylist,
  normalizeCurator,
  normalizeAlbum,
  normalizeStation,
  normalizeCity,
  normalizeSongwriter,
  toSuggestion,
} from './normalize';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

/**
 * Runs a single query function and converts its rows to suggestions.
 *
 * @param entityType - The entity type label used in the suggestion shape.
 * @param rows       - Raw database rows.
 * @param normalizer - Function that normalises a raw row.
 */
function rowsToSuggestions(
  entityType: string,
  rows: unknown[],
  normalizer: (row: RawRow) => Record<string, unknown>,
): SearchSuggestion[] {
  return (rows as RawRow[]).map((row) => {
    const normalized = normalizer(row);
    return toSuggestion(entityType, row, normalized);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a search operation and returns either a grouped result set
 * (standard mode) or a flat suggestions list (beta mode).
 *
 * @param params - Validated search parameters produced by
 *   {@link validateSearchParams}.
 * @returns A {@link SearchNormalResponse} for standard searches or a
 *   {@link SearchBetaResponse} for beta (autocomplete) searches.
 */
export async function search(
  params: SearchParams,
): Promise<SearchNormalResponse | SearchBetaResponse> {
  const { q, limit, offset, type, beta, platforms, triggerCitiesOnly } = params;

  // ── Beta mode: return a flat suggestions list ─────────────────────────────
  if (beta) {
    // Determine which entity types to query.  When `platforms` is specified
    // we use it as a hint (playlists / curators filtered by platform), but
    // we still run all entity queries and filter post-normalisation.
    const suggestions: SearchSuggestion[] = [];

    const [
      artistRows,
      trackRows,
      playlistRows,
      curatorRows,
      albumRows,
      stationRows,
      cityRows,
      songwriterRows,
    ] = await Promise.all([
      queryArtists(q, limit, offset),
      queryTracks(q, limit, offset),
      queryPlaylists(q, limit, offset),
      queryCurators(q, limit, offset),
      queryAlbums(q, limit, offset),
      queryStations(q, limit, offset),
      queryCities(q, limit, offset, triggerCitiesOnly),
      querySongwriters(q, limit, offset),
    ]);

    suggestions.push(...rowsToSuggestions('artists', artistRows, normalizeArtist as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('tracks', trackRows, normalizeTrack as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('playlists', playlistRows, normalizePlaylist as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('curators', curatorRows, normalizeCurator as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('albums', albumRows, normalizeAlbum as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('stations', stationRows, normalizeStation as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('cities', cityRows, normalizeCity as unknown as (r: RawRow) => Record<string, unknown>));
    suggestions.push(...rowsToSuggestions('songwriters', songwriterRows, normalizeSongwriter as unknown as (r: RawRow) => Record<string, unknown>));

    // Filter suggestions by platform when the caller requested it
    const filtered =
      platforms.length > 0
        ? suggestions.filter(
            (s) =>
              s.platforms.length === 0 ||
              s.platforms.some((p) => platforms.includes(p)),
          )
        : suggestions;

    return { obj: { suggestions: filtered } };
  }

  // ── Standard mode: return grouped results ────────────────────────────────
  const grouped: SearchGroupedResults = {};

  if (type === 'all' || type === 'artists') {
    const rows = await queryArtists(q, limit, offset);
    grouped.artists = (rows as RawRow[]).map(normalizeArtist);
  }

  if (type === 'all' || type === 'tracks') {
    const rows = await queryTracks(q, limit, offset);
    grouped.tracks = (rows as RawRow[]).map(normalizeTrack);
  }

  if (type === 'all' || type === 'playlists') {
    const rows = await queryPlaylists(q, limit, offset);
    grouped.playlists = (rows as RawRow[]).map(normalizePlaylist);
  }

  if (type === 'all' || type === 'curators') {
    const rows = await queryCurators(q, limit, offset);
    grouped.curators = (rows as RawRow[]).map(normalizeCurator);
  }

  if (type === 'all' || type === 'albums') {
    const rows = await queryAlbums(q, limit, offset);
    grouped.albums = (rows as RawRow[]).map(normalizeAlbum);
  }

  if (type === 'all' || type === 'stations') {
    const rows = await queryStations(q, limit, offset);
    grouped.stations = (rows as RawRow[]).map(normalizeStation);
  }

  if (type === 'all' || type === 'cities') {
    const rows = await queryCities(q, limit, offset, triggerCitiesOnly);
    grouped.cities = (rows as RawRow[]).map(normalizeCity);
  }

  if (type === 'all' || type === 'songwriters') {
    const rows = await querySongwriters(q, limit, offset);
    grouped.songwriters = (rows as RawRow[]).map(normalizeSongwriter);
  }

  return { obj: grouped };
}
