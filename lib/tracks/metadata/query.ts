import { db } from '@/lib/db';

export async function queryTrack(trackId: number): Promise<unknown | null> {
  return db.track.findUnique({
    where: { id: trackId },
    include: {
      trackArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              country: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      trackAlbums: {
        include: {
          album: {
            select: {
              id: true,
              title: true,
              releaseDate: true,
              label: true,
              coverUrl: true,
              popularity: true,
            },
          },
        },
      },
      trackTags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      },
    },
  });
}
