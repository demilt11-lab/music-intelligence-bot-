// lib/songwriters/service.ts
import { db } from '@/lib/db';
import { tracksService } from '@/lib/tracks/service';

type CatalogOptions = {
  songwriterId: number;
  limit: number;
  offset: number;
};

export async function getCatalogWithStatsAndCharts(
  options: CatalogOptions,
) {
  const { songwriterId, limit, offset } = options;

  // Join table linking songwriter to tracks
  const trackLinks = await (db as any).songwriterTrack?.findMany({
    where: { songwriterId },
    select: { trackId: true },
    take: limit,
    skip: offset,
  }) ?? [];

  const trackIds = (trackLinks as any[]).map((x: any) => x.trackId);
  const tracks = await tracksService.getTracksByIdsWithStatsAndCharts(
    trackIds,
  );

  return {
    songwriterId,
    count: trackIds.length,
    tracks,
  };
}
