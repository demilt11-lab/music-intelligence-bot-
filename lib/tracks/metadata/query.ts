import { db } from '@/lib/db';

/**
 * Fetches a single track by its primary key, including all relations required
 * to build a complete {@link TrackMetadata} response.
 *
 * Relations included:
 * - `trackArtists` → `artist` (credit information)
 * - `trackAlbums`  → `album` (release/label information)
 * - `trackTags`    → `tag`   (editorial classification)
 * - `trackStatisticsLatest` (latest cross-platform stat snapshot)
 *
 * @param trackId - The integer primary key of the track.
 * @returns The raw Prisma row, or `null` when no matching record exists.
 */
export async function queryTrack(trackId: number): Promise<unknown | null> {
  return db.track.findUnique({
    where: { id: trackId },
    include: {
      // Credits: artists ordered by their credited position
      trackArtists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              code2: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      // Albums this track belongs to
      trackAlbums: {
        include: {
          album: {
            select: {
              id: true,
              title: true,
              upc: true,
              releaseDate: true,
              label: true,
              imageUrl: true,
              popularity: true,
            },
          },
        },
        orderBy: { isPrimary: 'desc' },
      },
      // Editorial tags (genre, mood, activity, etc.)
      trackTags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
      // Latest aggregated statistics snapshot
      trackStatisticsLatest: true,
    },
  });
}
