/**
 * Curator playlists – database query layer.
 * @module lib/curators/playlists/query
 */

import { db } from '@/lib/db';
import type { CuratorPlaylistsParams } from './types';

/**
 * Raw playlist row shape returned from the database before normalisation.
 * All fields are nullable because they originate from dynamic joins.
 */
export interface RawCuratorPlaylistRow {
  id: number;
  externalPlaylistId: string | null;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  sysLastUpdated: Date | string | null;
  lastUpdated: Date | string | null;
  personalized: boolean | null;
  code2: string | null;
  ownerName: string | null;
  ownerId: number | null;
  externalUserId: string | null;
  official: boolean | null;
  /** JSON string or array of tag objects. */
  tags: unknown;
  followers: bigint | null;
  numTrack: number | null;
  followerDiffWeek: bigint | null;
  followerDiffMonth: bigint | null;
  catalog: number | null;
  activeRatio: number | null;
}

/**
 * Queries playlists belonging to a specific curator.
 *
 * Joins:
 * - `curator_playlists` link table – to scope playlists to the curator.
 * - `playlist_metrics_latest` – to supply follower and diff metrics.
 *
 * Runs the paginated data fetch and the total count in parallel.
 *
 * @param params - Validated {@link CuratorPlaylistsParams}.
 * @returns An object with `data` (raw rows) and `total` (unfiltered count).
 */
export async function queryCuratorPlaylists(
  params: CuratorPlaylistsParams,
): Promise<{ data: RawCuratorPlaylistRow[]; total: number }> {
   
  const where: Record<string, any> = {
    platform: params.platform,
    curatorPlaylists: {
      some: {
        curatorId: params.curatorId,
      },
    },
  };

  if (params.storefront) {
    where.code2 = params.storefront;
  }

  const orderBy = {
    [params.sortColumn]: params.sortOrderDesc ? 'desc' : 'asc',
  };

  const [rows, total] = await Promise.all([
    db.playlist.findMany({
      where,
      orderBy,
      skip: params.offset,
      take: params.limit,
      include: {
        playlistMetricsLatest: true,
        playlistTags: {
          include: {
            tag: true,
          },
        },
      },
    }),
    db.playlist.count({ where }),
  ]);

  // Flatten metrics and tags into the raw row shape
  const data: RawCuratorPlaylistRow[] = rows.map((row) => {
     
    const r = row as any;
    const metrics = r.playlistMetricsLatest ?? null;
    const tags = Array.isArray(r.playlistTags)
      ? r.playlistTags.map((pt: any) => ({
          id: pt.tag?.id ?? pt.tagId,
          name: pt.tag?.name ?? null,
        }))
      : [];

    return {
      id: r.id,
      externalPlaylistId: r.externalPlaylistId ?? null,
      name: r.name ?? null,
      description: r.description ?? null,
      imageUrl: r.imageUrl ?? null,
      sysLastUpdated: r.sysLastUpdated ?? null,
      lastUpdated: r.lastUpdated ?? null,
      personalized: r.personalized ?? null,
      code2: r.code2 ?? null,
      ownerName: r.ownerName ?? null,
      ownerId: r.ownerId ?? null,
      externalUserId: r.externalUserId ?? null,
      official: r.official ?? null,
      tags,
      followers: metrics?.followers ?? null,
      numTrack: r.numTrack ?? metrics?.numTrack ?? null,
      followerDiffWeek: metrics?.followerDiffWeek ?? null,
      followerDiffMonth: metrics?.followerDiffMonth ?? null,
      catalog: metrics?.catalog ?? null,
      activeRatio: metrics?.activeRatio ?? null,
    };
  });

  return { data, total };
}
