/**
 * Resolves a TikTok sound to a canonical Track record (or creates a stub).
 *
 * Resolution order:
 *   1. ExternalId lookup: platform='tiktok', externalId=sound.id
 *   2. Fuzzy name+artist match against existing tracks
 *   3. Create stub Track + Artist + TrackArtist + ExternalId
 */

import { db } from '@/lib/db';

export interface TiktokSound {
  id: string;
  title: string;
  authorName: string;
}

export interface ResolvedTrack {
  trackId: number;
  isNew: boolean;
}

/**
 * Normalise a string for fuzzy comparison: lowercase, strip punctuation/whitespace.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Attempt to find an existing track by ExternalId, then by fuzzy title+author,
 * or create a stub with all required relations.
 */
export async function resolveTiktokSound(sound: TiktokSound): Promise<ResolvedTrack> {
  // 1. ExternalId lookup
  const existing = await db.externalId.findFirst({
    where: {
      entityType: 'track',
      platform: 'tiktok',
      externalId: sound.id,
    },
  });

  if (existing) {
    return { trackId: existing.entityId, isNew: false };
  }

  // 2. Fuzzy title+artist match
  const normTitle = normalise(sound.title);
  const normAuthor = normalise(sound.authorName);

  if (normTitle && normAuthor) {
    // Pull candidate tracks whose title contains the first token of the sound title
    const titleToken = normTitle.split(' ')[0];
    const candidates = await db.track.findMany({
      where: {
        title: {
          contains: titleToken,
          mode: 'insensitive',
        },
      },
      include: {
        trackArtists: {
          include: { artist: true },
        },
        externalIds: {
          where: { platform: 'tiktok' },
        },
      },
      take: 50,
    });

    for (const candidate of candidates) {
      if (candidate.externalIds.length > 0) continue; // already has a tiktok id

      const normCandTitle = normalise(candidate.title);
      if (normCandTitle !== normTitle) continue;

      const artistMatch = candidate.trackArtists.some(
        (ta) => normalise(ta.artist.name) === normAuthor,
      );
      if (!artistMatch) continue;

      // Found a match — attach ExternalId and return
      await db.externalId.create({
        data: {
          entityType: 'track',
          entityId: candidate.id,
          platform: 'tiktok',
          externalId: sound.id,
        },
      });

      return { trackId: candidate.id, isNew: false };
    }
  }

  // 3. Create stub track + artist + junction + external ID
  const track = await db.track.create({
    data: {
      title: sound.title,
    },
  });

  // Upsert artist by name (slug = normalised name with hyphens)
  const artistSlug = normalise(sound.authorName).replace(/\s+/g, '-') || `tiktok-${sound.id}`;

  let artist = await db.artist.findFirst({
    where: { name: { equals: sound.authorName, mode: 'insensitive' } },
  });

  if (!artist) {
    // If the slug is already taken, append the track id to make it unique
    const existingSlug = await db.artist.findUnique({ where: { slug: artistSlug } });
    const finalSlug = existingSlug ? `${artistSlug}-${track.id}` : artistSlug;

    artist = await db.artist.create({
      data: {
        name: sound.authorName,
        slug: finalSlug,
      },
    });
  }

  await db.trackArtist.create({
    data: {
      trackId: track.id,
      artistId: artist.id,
      role: 'main',
      position: 0,
    },
  });

  await db.externalId.create({
    data: {
      entityType: 'track',
      entityId: track.id,
      platform: 'tiktok',
      externalId: sound.id,
    },
  });

  return { trackId: track.id, isNew: true };
}
