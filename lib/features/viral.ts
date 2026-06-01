// lib/features/viral.ts
import { tracksService } from '@/lib/tracks/service';
import { radioService } from '@/lib/radio';
import { db } from '@/lib/db';

export type ViralFeatures = {
  trackId: number;
  isrc?: string;
  spotifyStreams?: number;
  spotifyPopularity?: number;
  tiktokVideoCount?: number;
  youtubeViews?: number;
  streamVelocity7d?: number;
  tiktokGrowth7d?: number;
  playlistCount?: number;
  playlistAdds7d?: number;
  radioSpins7d?: number;
};

export async function buildViralFeatures(
  trackId: number,
): Promise<ViralFeatures> {
  const track = await tracksService.getTrackById(trackId);

  const spotifyStreams = Number(
    track.statistics?.spotifyStreams ?? 0,
  );
  const tiktokVideoCount =
    track.statistics?.tiktokVideoCount ?? 0;
  const youtubeViews = Number(
    track.statistics?.youtubeViews ?? 0,
  );
  const spotifyPopularity =
    track.statistics?.spotifyPopularity ?? 0;

  const streamVelocity7d =
    track.statistics?.streamVelocity7d ?? null;
  const tiktokGrowth7d =
    track.statistics?.tiktokGrowth7d ?? null;

  const playlistCount = await db.playlistMembershipEvent.count({
    where: { trackId },
  });

  const playlistAdds7d = await db.playlistMembershipEvent.count({
    where: {
      trackId,
      eventDate: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const airplayTotals = await radioService.getTrackAirplayTotals(
    { type: 'track', id: trackId, since: since7d, station: undefined, limit: 50 },
  );

  const radioSpins7d = airplayTotals?.obj?.stations?.length ?? null;

  return {
    trackId,
    isrc: track.isrc,
    spotifyStreams,
    spotifyPopularity,
    tiktokVideoCount,
    youtubeViews,
    streamVelocity7d: streamVelocity7d ?? undefined,
    tiktokGrowth7d: tiktokGrowth7d ?? undefined,
    playlistCount,
    playlistAdds7d,
    radioSpins7d: radioSpins7d ?? undefined,
  };
}
