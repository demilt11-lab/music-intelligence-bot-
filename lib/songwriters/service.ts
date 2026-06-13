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

  const trackLinks = await db.songwriterTrack.findMany({
    where: { songwriterId },
    select: { trackId: true },
    take: limit,
    skip: offset,
  });

  const trackIds = trackLinks.map((x) => x.trackId);
  const tracks = await tracksService.getTracksByIdsWithStatsAndCharts(trackIds);

  return {
    songwriterId,
    count: trackIds.length,
    tracks,
  };
}
