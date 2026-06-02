/**
 * Resolves a YouTube video to an existing Track or creates a stub.
 * Also maps YouTube channels to Artists via external_ids.
 */

import { db } from '@/lib/db';

export interface YoutubeVideoInput {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
}

/** Normalise a string for fuzzy comparison: lowercase, remove punctuation. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find-or-create an Artist record for a YouTube channel.
 * Uses `external_ids` with platform='youtube_channel' and externalId=channelId.
 */
async function resolveArtist(channelId: string, channelTitle: string): Promise<number> {
  // 1. Look up by youtube_channel external_id
  const existing = await db.externalId.findFirst({
    where: { platform: 'youtube_channel', externalId: channelId, entityType: 'artist' },
  });
  if (existing) return existing.entityId;

  // 2. Try fuzzy name match against existing artists
  const normChannel = normalise(channelTitle);
  const candidates = await db.artist.findMany({
    where: { name: { contains: channelTitle.split(' ')[0], mode: 'insensitive' } },
  });
  for (const candidate of candidates) {
    if (normalise(candidate.name) === normChannel) {
      // Link this artist to the channel
      await db.externalId.create({
        data: { entityType: 'artist', entityId: candidate.id, platform: 'youtube_channel', externalId: channelId },
      });
      return candidate.id;
    }
  }

  // 3. Create a stub artist
  const artist = await db.artist.create({
    data: { name: channelTitle },
  });
  await db.externalId.create({
    data: { entityType: 'artist', entityId: artist.id, platform: 'youtube_channel', externalId: channelId },
  });
  return artist.id;
}

/**
 * Resolve a YouTube video to an existing Track, or create a stub Track.
 * Resolution order:
 *   1. ExternalId platform='youtube', externalId=videoId
 *   2. Fuzzy title + channel name match
 *   3. Create new stub Track + Artist + TrackArtist + ExternalId records
 *
 * Returns the resolved/created track id.
 */
export async function resolveYoutubeVideo(video: YoutubeVideoInput): Promise<number> {
  // 1. Direct external_id lookup
  const byExtId = await db.externalId.findFirst({
    where: { platform: 'youtube', externalId: video.id, entityType: 'track' },
  });
  if (byExtId) return byExtId.entityId;

  // 2. Fuzzy title match — check tracks whose title roughly equals the video title
  const normTitle = normalise(video.title);
  const titleWord = video.title.split(' ').slice(0, 3).join(' ');
  const titleCandidates = await db.track.findMany({
    where: { title: { contains: titleWord, mode: 'insensitive' } },
    include: { trackArtists: { include: { artist: true } } },
  });
  for (const track of titleCandidates) {
    if (normalise(track.title) !== normTitle) continue;
    const artistMatch = track.trackArtists.some(
      (ta) => normalise(ta.artist.name) === normalise(video.channelTitle),
    );
    if (artistMatch) {
      // Attach youtube external_id for future lookups
      await db.externalId.createMany({
        data: [{ entityType: 'track', entityId: track.id, platform: 'youtube', externalId: video.id }],
        skipDuplicates: true,
      });
      return track.id;
    }
  }

  // 3. Create stub
  const artistId = await resolveArtist(video.channelId, video.channelTitle);

  const track = await db.track.create({
    data: { title: video.title },
  });

  await db.trackArtist.create({
    data: { trackId: track.id, artistId, role: 'main' },
  });

  await db.externalId.create({
    data: { entityType: 'track', entityId: track.id, platform: 'youtube', externalId: video.id },
  });

  return track.id;
}
