import { toBigIntString } from '@/lib/shared/bigint';
import {
  SearchArtistResult,
  SearchTrackResult,
  SearchPlaylistResult,
  SearchCuratorResult,
  SearchAlbumResult,
  SearchStationResult,
  SearchCityResult,
  SearchSongwriterResult,
  SearchSuggestion,
  SearchEntityType,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns `null` if `v` is nullish, otherwise trims the string. */
function nullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

/** Converts a Date, ISO string, or null to an ISO date string (YYYY-MM-DD) or null. */
function toDateString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return s || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity normalisers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a raw Prisma artist row into a {@link SearchArtistResult}.
 *
 * @param row - Raw database row (may contain snake_case or camelCase fields).
 */
export function normalizeArtist(row: Record<string, unknown>): SearchArtistResult {
  // Prisma returns camelCase; the cast lets us handle either convention.
  const externalIds = (row.externalIds as Array<Record<string, unknown>> | undefined) ?? [];
  const spotifyRow = externalIds.find(
    (e) => e.platform === 'spotify' || e.platform_name === 'spotify',
  );

  const spotifyFollowers =
    spotifyRow?.followers !== undefined && spotifyRow.followers !== null
      ? Number(spotifyRow.followers)
      : null;

  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
    code2: nullableString(row.code2 ?? row.country_code),
    spotifyFollowers,
    score: row.popularity !== undefined && row.popularity !== null
      ? Number(row.popularity)
      : null,
  };
}

/**
 * Normalises a raw Prisma track row (with nested `trackArtists`) into a
 * {@link SearchTrackResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeTrack(row: Record<string, unknown>): SearchTrackResult {
  const trackArtists =
    (row.trackArtists as Array<Record<string, unknown>> | undefined) ?? [];

  const artists = trackArtists.map((ta) => {
    const artist = (ta.artist as Record<string, unknown> | undefined) ?? ta;
    return { id: Number(artist.id), name: String(artist.name ?? '') };
  });

  return {
    id: Number(row.id),
    name: String(row.name ?? row.title ?? ''),
    isrc: nullableString(row.isrc),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
    artists,
    releaseDate: toDateString(row.releaseDate ?? row.release_date),
    score: row.popularity !== undefined && row.popularity !== null
      ? Number(row.popularity)
      : null,
  };
}

/**
 * Normalises a raw Prisma playlist row into a {@link SearchPlaylistResult}.
 *
 * The follower count is serialised as a string to preserve bigint precision.
 *
 * @param row - Raw database row.
 */
export function normalizePlaylist(row: Record<string, unknown>): SearchPlaylistResult {
  // Try to derive follower count from nested metrics relation
  const metricsArr =
    (row.playlistMetricsLatest as Array<Record<string, unknown>> | undefined) ?? [];
  const metrics = metricsArr[0] ?? (row.metrics as Record<string, unknown> | undefined);
  const rawFollowers = metrics?.followers ?? row.followers;

  const curatorLinks =
    (row.playlistCuratorLinks as Array<Record<string, unknown>> | undefined) ?? [];
  const curatorLink = curatorLinks[0];
  const curatorObj =
    (curatorLink?.curator as Record<string, unknown> | undefined) ?? null;
  const ownerName = curatorObj ? nullableString(curatorObj.name) : null;

  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
    platform: String(row.platform ?? row.platformName ?? ''),
    followers: toBigIntString(
      rawFollowers as bigint | number | null | undefined,
    ),
    ownerName,
  };
}

/**
 * Normalises a raw Prisma curator row (with `_count`) into a
 * {@link SearchCuratorResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeCurator(row: Record<string, unknown>): SearchCuratorResult {
  const countObj = row._count as Record<string, unknown> | undefined;
  const numPlaylists =
    countObj?.curatorPlaylists !== undefined
      ? Number(countObj.curatorPlaylists)
      : null;

  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
    platform: String(row.platform ?? row.platformName ?? ''),
    numPlaylists,
  };
}

/**
 * Normalises a raw Prisma album row into a {@link SearchAlbumResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeAlbum(row: Record<string, unknown>): SearchAlbumResult {
  // Artists are linked via track_albums → track → track_artists
  const trackAlbums =
    (row.trackAlbums as Array<Record<string, unknown>> | undefined) ?? [];
  const firstTrack = trackAlbums[0]
    ? (trackAlbums[0].track as Record<string, unknown> | undefined)
    : undefined;
  const trackArtists =
    (firstTrack?.trackArtists as Array<Record<string, unknown>> | undefined) ?? [];

  const artists = trackArtists.map((ta) => {
    const artist = (ta.artist as Record<string, unknown> | undefined) ?? ta;
    return { id: Number(artist.id), name: String(artist.name ?? '') };
  });

  // UPC can come from externalIds or a direct field
  const externalIds =
    (row.externalIds as Array<Record<string, unknown>> | undefined) ?? [];
  const upcRow = externalIds.find(
    (e) => e.platform === 'upc' || (e.entityType === 'album' && e.externalId),
  );
  const upc = nullableString(
    (row.upc as string | undefined) ?? (upcRow?.externalId as string | undefined),
  );

  return {
    id: Number(row.id),
    name: String(row.name ?? row.title ?? ''),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
    upc,
    releaseDate: toDateString(row.releaseDate ?? row.release_date),
    artists,
  };
}

/**
 * Normalises a raw Prisma station row into a {@link SearchStationResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeStation(row: Record<string, unknown>): SearchStationResult {
  const radioStations =
    (row.radioStations as Array<Record<string, unknown>> | undefined) ?? [];
  const radio = radioStations[0];

  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    country: nullableString(row.country ?? radio?.country),
    genre: nullableString(row.genre ?? radio?.genre),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
  };
}

/**
 * Normalises a raw Prisma city row into a {@link SearchCityResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeCity(row: Record<string, unknown>): SearchCityResult {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    code2: nullableString(row.code2 ?? row.country_code),
    country: nullableString(row.country ?? row.country_name),
    isTrigger: Boolean(row.isTrigger ?? row.is_trigger ?? false),
  };
}

/**
 * Normalises a raw Prisma artist row (representing a songwriter) into a
 * {@link SearchSongwriterResult}.
 *
 * @param row - Raw database row.
 */
export function normalizeSongwriter(row: Record<string, unknown>): SearchSongwriterResult {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    imageUrl: nullableString(row.imageUrl ?? row.image_url),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Beta suggestion builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a normalised entity into a {@link SearchSuggestion} for the beta
 * suggestions endpoint.
 *
 * @param type       - The entity type string (e.g. `"artists"`, `"tracks"`).
 * @param row        - The raw database row (used to extract platform hints).
 * @param normalized - The already-normalised entity object.
 */
export function toSuggestion(
  type: string,
  row: Record<string, unknown>,
  normalized: Record<string, unknown>,
): SearchSuggestion {
  const name = String(normalized.name ?? '');
  const imageUrl = (normalized.imageUrl as string | null) ?? null;

  // Derive subtitle based on entity type
  let subtitle: string | null = null;
  let platforms: string[] = [];

  switch (type) {
    case 'tracks': {
      const artists = normalized.artists as Array<{ name: string }> | undefined;
      subtitle = artists && artists.length > 0 ? artists[0].name : null;
      break;
    }
    case 'playlists': {
      subtitle = (normalized.platform as string | null) ?? null;
      platforms = subtitle ? [subtitle] : [];
      break;
    }
    case 'curators': {
      subtitle = (normalized.platform as string | null) ?? null;
      platforms = subtitle ? [subtitle] : [];
      break;
    }
    case 'albums': {
      const albumArtists = normalized.artists as Array<{ name: string }> | undefined;
      subtitle = albumArtists && albumArtists.length > 0 ? albumArtists[0].name : null;
      break;
    }
    case 'stations': {
      subtitle = (normalized.country as string | null) ?? null;
      break;
    }
    case 'cities': {
      subtitle = (normalized.country as string | null) ?? null;
      break;
    }
    default:
      subtitle = null;
  }

  // For artists/tracks/albums we can infer platforms from externalIds
  if (type === 'artists' || type === 'tracks' || type === 'albums') {
    const externalIds =
      (row.externalIds as Array<Record<string, unknown>> | undefined) ?? [];
    const derivedPlatforms = externalIds
      .map((e) => String(e.platform ?? ''))
      .filter(Boolean);
    if (derivedPlatforms.length > 0) {
      platforms = [...new Set(derivedPlatforms)];
    }
  }

  return {
    type: type as SearchEntityType,
    id: Number(normalized.id),
    name,
    imageUrl,
    subtitle,
    platforms,
  };
}
