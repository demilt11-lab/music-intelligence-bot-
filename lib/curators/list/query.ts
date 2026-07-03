import { db } from '@/lib/db';
import type { CuratorListParams } from './types';

/**
 * Raw result shape returned from the database before normalisation.
 * All fields are optional/nullable because they come from a dynamic join.
 */
export interface RawCuratorRow {
  id: number;
  platform: string;
  externalOwnerId: string | null;
  ownerName: string | null;
  imageUrl: string | null;
  numPlaylists: number | null;
  totalReach: bigint | null;
  followers: bigint | null;
  followerDiffMonth: bigint | null;
  followerDiffPercentMonth: number | null;
  tags: string[] | null;
  numUpdates: number | null;
  numTracksUpdated: number | null;
  editorial: boolean | null;
  majorLabel: boolean | null;
  brand: boolean | null;
  popularIndie: boolean | null;
  indie: boolean | null;
  audiobook: boolean | null;
  code2: string | null;
}

/**
 * Builds a Prisma `where` clause for the curator list query.
 *
 * The Curator model is thinner than the public filter surface: filters with
 * no schema backing (majorLabel, brand, popularIndie, audiobook) are accepted
 * but currently match nothing special — they are ignored rather than crashing
 * the query. `editorial`/`indie` map to the closest real column (isVerified).
 */
function buildWhere(params: CuratorListParams): Record<string, any> {
  const where: Record<string, any> = {
    platform: params.platform,
  };

  if (params.shortlistIds.length > 0) {
    where.id = { in: params.shortlistIds };
  }

  if (params.nameSearch) {
    where.name = { contains: params.nameSearch, mode: 'insensitive' };
  }

  if (params.editorial !== undefined) {
    where.isVerified = params.editorial;
  }
  if (params.indie !== undefined) {
    where.isVerified = !params.indie;
  }
  if (params.code2 !== undefined) {
    where.countryCode = params.code2;
  }

  if (params.playlistKeywordSearch) {
    // Filter via related playlists that contain the keyword in their name
    where.curatorPlaylists = {
      some: {
        playlist: {
          name: {
            contains: params.playlistKeywordSearch,
            mode: 'insensitive',
          },
        },
      },
    };
  }

  return where;
}

/**
 * Maps a public sort column to a Prisma orderBy the Curator model supports.
 * Metric-history sorts (total_reach, num_updates, …) have no per-curator
 * history table yet, so they fall back to the nearest real ordering.
 */
function buildOrderBy(sortColumn: string, sortOrderDesc: boolean): Record<string, any> {
  const dir = sortOrderDesc ? 'desc' : 'asc';
  switch (sortColumn) {
    case 'followers':
    case 'fdiff_month':
    case 'fdiff_percent_month':
    case 'total_reach':
      return { followerCount: dir };
    case 'num_playlists':
    case 'num_updates':
    case 'num_tracks_updated':
    default:
      return { curatorPlaylists: { _count: dir } };
  }
}

/**
 * Queries the `curators` table (with latest metrics join) and returns a page
 * of results together with the total matched count.
 *
 * @param params - Validated {@link CuratorListParams}.
 * @returns An object with `data` (raw rows) and `total` (unfiltered count).
 */
export async function queryCurators(
  params: CuratorListParams,
): Promise<{ data: RawCuratorRow[]; total: number }> {
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params.sortColumn, params.sortOrderDesc);

  const [rows, total] = await Promise.all([
    db.curator.findMany({
      where,
      orderBy,
      skip: params.offset,
      take: params.limit,
      include: {
        curatorMetrics: {
          orderBy: { date: 'desc' },
          take: 1,
        },
        _count: {
          select: { curatorPlaylists: true },
        },
      },
    }),
    db.curator.count({ where }),
  ]);

  // Flatten metrics into the curator row shape
  const data: RawCuratorRow[] = rows.map((row) => {
    const metrics = row.curatorMetrics?.[0] ?? null;
    return {
      id: row.id,
      platform: row.platform,
      externalOwnerId: row.externalId ?? null,
      ownerName: row.name ?? null,
      imageUrl: row.imageUrl ?? null,
      numPlaylists: row._count?.curatorPlaylists ?? metrics?.playlistCount ?? null,
      totalReach: metrics?.totalReach ?? null,
      followers: row.followerCount ?? metrics?.followerCount ?? null,
      followerDiffMonth: null,
      followerDiffPercentMonth: null,
      tags: [],
      numUpdates: null,
      numTracksUpdated: null,
      editorial: row.isVerified ?? null,
      majorLabel: null,
      brand: null,
      popularIndie: null,
      indie: row.isVerified != null ? !row.isVerified : null,
      audiobook: null,
      code2: row.countryCode ?? null,
    };
  });

  return { data, total };
}
