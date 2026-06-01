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
 * Builds a Prisma `where` clause for the curator list query based on the
 * validated parameters.
 *
 * @param params - Validated curator list parameters.
 * @returns A Prisma-compatible `where` object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(params: CuratorListParams): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    platform: params.platform,
  };

  if (params.shortlistIds.length > 0) {
    where.id = { in: params.shortlistIds };
  }

  if (params.nameSearch) {
    where.ownerName = { contains: params.nameSearch, mode: 'insensitive' };
  }

  if (params.editorial !== undefined) {
    where.editorial = params.editorial;
  }
  if (params.majorLabel !== undefined) {
    where.majorLabel = params.majorLabel;
  }
  if (params.brand !== undefined) {
    where.brand = params.brand;
  }
  if (params.popularIndie !== undefined) {
    where.popularIndie = params.popularIndie;
  }
  if (params.indie !== undefined) {
    where.indie = params.indie;
  }
  if (params.audiobook !== undefined) {
    where.audiobook = params.audiobook;
  }
  if (params.code2 !== undefined) {
    where.code2 = params.code2;
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
 * Queries the `curators` table (with latest metrics join) and returns a page
 * of results together with the total matched count.
 *
 * The function performs two database operations in parallel:
 * 1. A `findMany` for the paginated rows.
 * 2. A `count` for the total matching rows (ignoring pagination).
 *
 * @param params - Validated {@link CuratorListParams}.
 * @returns An object with `data` (raw rows) and `total` (unfiltered count).
 */
export async function queryCurators(
  params: CuratorListParams,
): Promise<{ data: RawCuratorRow[]; total: number }> {
  const where = buildWhere(params);

  const orderBy = {
    [params.sortColumn]: params.sortOrderDesc ? 'desc' : 'asc',
  };

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
      },
    }),
    db.curator.count({ where }),
  ]);

  // Flatten metrics into the curator row shape
  const data: RawCuratorRow[] = rows.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const metrics = r.curatorMetrics?.[0] ?? null;
    return {
      id: r.id,
      platform: r.platform,
      externalOwnerId: r.externalOwnerId ?? null,
      ownerName: r.ownerName ?? null,
      imageUrl: r.imageUrl ?? null,
      numPlaylists: r.numPlaylists ?? metrics?.numPlaylists ?? null,
      totalReach: metrics?.totalReach ?? null,
      followers: metrics?.followers ?? null,
      followerDiffMonth: metrics?.followerDiffMonth ?? null,
      followerDiffPercentMonth: metrics?.followerDiffPercentMonth ?? null,
      tags: r.tags ?? [],
      numUpdates: metrics?.numUpdates ?? null,
      numTracksUpdated: metrics?.numTracksUpdated ?? null,
      editorial: r.editorial ?? null,
      majorLabel: r.majorLabel ?? null,
      brand: r.brand ?? null,
      popularIndie: r.popularIndie ?? null,
      indie: r.indie ?? null,
      audiobook: r.audiobook ?? null,
      code2: r.code2 ?? null,
    };
  });

  return { data, total };
}
