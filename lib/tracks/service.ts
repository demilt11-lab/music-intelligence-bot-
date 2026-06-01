// lib/tracks/service.ts
import { db } from '@/lib/db';

type TrackWithStatsAndCharts = any; // refine as needed

export const tracksService = {
  async getTrackById(trackId: number): Promise<any> {
    const track = await db.track.findUnique({
      where: { id: trackId },
      include: {
        trackArtists: { include: { artist: true } },
        externalIds: true,
        
      },
    });
    if (!track) {
      const err: any = new Error('Track not found');
      err.status = 404;
      throw err;
    }

    return track;
  },

  async getTracksByIdsWithStatsAndCharts(
    trackIds: number[],
  ): Promise<TrackWithStatsAndCharts[]> {
    if (!trackIds.length) return [];

    const tracks = await db.track.findMany({
      where: { id: { in: trackIds } },
      include: {
        trackArtists: { include: { artist: true } },
        externalIds: true,
        
        // add relations for charts/playlists/radio as needed
      },
    });

    // Optionally: attach charts & radio via separate queries if they
    // are in different tables keyed by trackId.
    return tracks;
  },
};
