/**
 * Input validation for the Playlist Directory endpoint.
 * Parses and validates raw URLSearchParams into a typed {@link PlaylistDirectoryParams} object.
 */

import { badRequest } from '@/lib/shared/errors';
import {
  parseBoolean,
  parseOptionalBoolean,
  parseOptionalString,
} from '@/lib/shared/validation';
import { parsePagination } from '@/lib/shared/pagination';
import { PLAYLIST_PLATFORMS, type PlaylistDirectoryParams, type PlaylistPlatform } from './types';
import { getPlaylistPlatformConfig } from './platform-config';

const MAX_PAGE_WINDOW = 10_000;
const DEFAULT_LIMIT = 50;

/**
 * Parses a repeated or comma-separated integer array query parameter.
 *
 * @param searchParams - The request's URLSearchParams.
 * @param key - The parameter key.
 * @returns An array of parsed integers (empty if not present).
 */
function parseIntArray(searchParams: URLSearchParams, key: string): number[] {
  const values = searchParams.getAll(key);
  if (values.length === 0) return [];
  return values
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const n = parseInt(v, 10);
      if (isNaN(n)) throw badRequest(`"${key}" must contain only integers; received "${v}".`);
      return n;
    });
}

/**
 * Validates and coerces URLSearchParams into a {@link PlaylistDirectoryParams} object.
 *
 * @param platform - The raw platform string from the URL segment.
 * @param searchParams - The request's URLSearchParams.
 * @returns A fully-typed params object ready for the query layer.
 * @throws An {@link ApiError} (400) on any invalid input.
 */
export function validatePlaylistDirectoryParams(
  platform: string,
  searchParams: URLSearchParams,
): PlaylistDirectoryParams {
  // --- platform ---
  if (!PLAYLIST_PLATFORMS.includes(platform as PlaylistPlatform)) {
    throw badRequest(
      `Invalid platform "${platform}". Must be one of: ${PLAYLIST_PLATFORMS.join(', ')}`,
    );
  }
  const typedPlatform = platform as PlaylistPlatform;
  const config = getPlaylistPlatformConfig(typedPlatform);

  // --- pagination ---
  const { offset, limit } = parsePagination(searchParams, DEFAULT_LIMIT, MAX_PAGE_WINDOW);

  // --- tags / shortlist ---
  const tagIds = parseIntArray(searchParams, 'tag_ids');
  const shortlistIds = parseIntArray(searchParams, 'shortlist_ids');

  // --- sorting ---
  const rawSort = searchParams.get('sort_column') ?? config.defaultSort;
  if (!config.allowedSorts.includes(rawSort)) {
    throw badRequest(
      `Invalid sort_column "${rawSort}" for platform "${typedPlatform}". ` +
        `Allowed: ${config.allowedSorts.join(', ')}`,
    );
  }
  const sortColumn = rawSort;
  const sortOrderDesc = parseBoolean(searchParams.get('sort_order_desc'), true);

  // --- optional filters ---
  const code2 = config.supportsCode2
    ? parseOptionalString(searchParams.get('code2'))
    : undefined;

  const editorial = parseOptionalBoolean(searchParams.get('editorial'));
  const topPlaylist = parseOptionalBoolean(searchParams.get('top_playlist'));
  const descriptionSearch = parseOptionalString(searchParams.get('description_search'));

  // --- platform-specific curator filters ---
  const curatorIds = config.supportsCuratorIds
    ? parseIntArray(searchParams, 'curator_ids')
    : [];
  const excludedCuratorIds = config.supportsCuratorIds
    ? parseIntArray(searchParams, 'excluded_curator_ids')
    : [];

  const indie = config.supportsIndie
    ? parseOptionalBoolean(searchParams.get('indie'))
    : undefined;
  const majorCurator = config.supportsMajorCurator
    ? parseOptionalBoolean(searchParams.get('major_curator'))
    : undefined;
  const newMusicFriday = config.supportsNewMusicFriday
    ? parseOptionalBoolean(searchParams.get('new_music_friday'))
    : undefined;

  return {
    platform: typedPlatform,
    offset,
    limit,
    tagIds,
    sortColumn,
    sortOrderDesc,
    code2,
    editorial,
    topPlaylist,
    descriptionSearch,
    shortlistIds,
    curatorIds,
    excludedCuratorIds,
    indie,
    majorCurator,
    newMusicFriday,
  };
}
