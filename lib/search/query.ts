import { db } from '@/lib/db';

/**
 * Builds a case-insensitive LIKE pattern from a search term.
 * Prisma's `contains` mode: 'insensitive' handles this on PostgreSQL.
 */
function likePattern(q: string): string {
  return q.trim();
}

/**
 * Searches the artists table for records whose name contains `q`.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma artist rows including their external IDs.
 */
export async function queryArtists(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.artist.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
    },
    include: {
      externalIds: {
        where: { entityType: 'artist', platform: 'spotify' },
        take: 1,
      },
    },
    orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the tracks table for records whose title contains `q`.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma track rows including their artists.
 */
export async function queryTracks(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.track.findMany({
    where: {
      title: { contains: term, mode: 'insensitive' },
    },
    include: {
      trackArtists: {
        include: { artist: { select: { id: true, name: true } } },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: [{ popularity: 'desc' }, { title: 'asc' }],
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the playlists table for records whose name contains `q`.
 * Includes the primary curator name via the curator link.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma playlist rows.
 */
export async function queryPlaylists(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.playlist.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
    },
    include: {
      playlistCuratorLinks: {
        include: { curator: { select: { id: true, name: true } } },
        take: 1,
      },
      playlistMetricsLatest: true,
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the curators table for records whose name contains `q`.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma curator rows with playlist count.
 */
export async function queryCurators(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.curator.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
    },
    include: {
      _count: { select: { curatorPlaylists: true } },
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the albums table for records whose title contains `q`.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma album rows with linked artists.
 */
export async function queryAlbums(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.album.findMany({
    where: {
      title: { contains: term, mode: 'insensitive' },
    },
    include: {
      trackAlbums: {
        include: {
          track: {
            include: {
              trackArtists: {
                include: { artist: { select: { id: true, name: true } } },
                orderBy: { position: 'asc' },
                take: 1,
              },
            },
          },
        },
        take: 1,
      },
      externalIds: {
        where: { entityType: 'album', platform: 'spotify' },
        take: 1,
      },
    },
    orderBy: [{ popularity: 'desc' }, { title: 'asc' }],
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the stations table for records whose name contains `q`.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma station rows.
 */
export async function queryStations(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.station.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
    },
    include: {
      radioStations: { take: 1, orderBy: { weeklyAudience: 'desc' } },
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Searches the cities table for records whose name contains `q`.
 * Optionally restricts to cities that are "trigger" cities.
 *
 * Note: The schema `City` model does not have an `isTrigger` field;
 * this implementation queries all cities. If you add `isTrigger Boolean`
 * to the schema the `triggerOnly` branch will activate automatically.
 *
 * @param q           - Raw search term.
 * @param limit       - Maximum rows to return.
 * @param offset      - Number of rows to skip.
 * @param triggerOnly - When true, restrict to trigger cities.
 * @returns Raw Prisma city rows.
 */
export async function queryCities(
  q: string,
  limit: number,
  offset: number,
  triggerOnly: boolean,
): Promise<unknown[]> {
  const term = likePattern(q);
   
  const where: Record<string, any> = {
    name: { contains: term, mode: 'insensitive' },
  };
  // If the schema exposes `isTrigger`, restrict accordingly.
  if (triggerOnly) {
    // Prisma will throw a compile-time error if the field does not exist;
    // the cast lets the runtime decide, keeping the code future-proof.
    (where as Record<string, unknown>)['isTrigger'] = true;
  }
  return db.city.findMany({
    where,
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Searches for songwriters (artists tagged with a composer role) whose name
 * contains `q`. Since the schema tracks composers via `TrackArtist.role`, we
 * return distinct artists that have at least one "composer" track-artist link.
 *
 * @param q      - Raw search term.
 * @param limit  - Maximum rows to return.
 * @param offset - Number of rows to skip.
 * @returns Raw Prisma artist rows representing songwriters.
 */
export async function querySongwriters(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const term = likePattern(q);
  return db.artist.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
      trackArtists: {
        some: {
          role: { in: ['composer', 'songwriter', 'lyricist', 'writer'] },
        },
      },
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// External-ID lookups (used when the search query is a platform URL)
// ─────────────────────────────────────────────────────────────────────────────

async function findEntityId(
  platform: string,
  externalId: string,
  entityType: string,
): Promise<number | null> {
  const row = await db.externalId.findFirst({
    where: { platform, externalId, entityType },
    select: { entityId: true },
  });
  return row?.entityId ?? null;
}

export async function queryArtistByExternalId(
  platform: string,
  externalId: string,
): Promise<unknown[]> {
  const entityId = await findEntityId(platform, externalId, 'artist');
  if (entityId === null) return [];
  return db.artist.findMany({
    where: { id: entityId },
    include: {
      externalIds: { where: { entityType: 'artist', platform: 'spotify' }, take: 1 },
    },
    take: 1,
  });
}

export async function queryTrackByExternalId(
  platform: string,
  externalId: string,
): Promise<unknown[]> {
  const entityId = await findEntityId(platform, externalId, 'track');
  if (entityId === null) return [];
  return db.track.findMany({
    where: { id: entityId },
    include: {
      trackArtists: {
        include: { artist: { select: { id: true, name: true } } },
        orderBy: { position: 'asc' },
      },
    },
    take: 1,
  });
}

export async function queryAlbumByExternalId(
  platform: string,
  externalId: string,
): Promise<unknown[]> {
  const entityId = await findEntityId(platform, externalId, 'album');
  if (entityId === null) return [];
  return db.album.findMany({
    where: { id: entityId },
    include: {
      trackAlbums: {
        include: {
          track: {
            include: {
              trackArtists: {
                include: { artist: { select: { id: true, name: true } } },
                orderBy: { position: 'asc' },
                take: 1,
              },
            },
          },
        },
        take: 1,
      },
      externalIds: { where: { entityType: 'album', platform: 'spotify' }, take: 1 },
    },
    take: 1,
  });
}

export async function queryPlaylistByExternalId(
  platform: string,
  externalId: string,
): Promise<unknown[]> {
  const entityId = await findEntityId(platform, externalId, 'playlist');
  if (entityId === null) return [];
  return db.playlist.findMany({
    where: { id: entityId },
    include: {
      playlistCuratorLinks: {
        include: { curator: { select: { id: true, name: true } } },
        take: 1,
      },
      playlistMetricsLatest: true,
    },
    take: 1,
  });
}
