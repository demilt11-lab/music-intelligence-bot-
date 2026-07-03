// lib/crawler/resolveTrack.ts
//
// Shared (title, artist) -> canonical Track resolution for every crawl4ai
// ingestion job that scrapes ranked title/artist lists (chart sites, DSP
// playlists, radio spins). Originally hand-rolled inside
// jobs/ingest/billboard.ts; extracted here once a second and third job
// needed the identical fuzzy-match-then-stub-create behavior.

import { db } from '@/lib/db';
import { normalise } from '@/lib/crawler/textParsing';

export interface ResolvedTrack {
  trackId: number;
  isNew: boolean;
}

/**
 * Resolve a scraped (title, artist) pair to a canonical Track:
 *   1. Fuzzy title + artist match against existing tracks.
 *   2. Create a stub Track (+ Artist, if needed) otherwise.
 *
 * `sourceLabel` is used only for the stub-creation log line, e.g. "billboard".
 */
export async function resolveTrackByTitleArtist(
  title: string,
  artist: string,
  sourceLabel: string,
): Promise<ResolvedTrack> {
  const normTitle = normalise(title);
  const normArtist = normalise(artist);

  if (normTitle && normArtist) {
    const titleToken = normTitle.split(' ')[0];
    const candidates = await db.track.findMany({
      where: { title: { contains: titleToken, mode: 'insensitive' } },
      include: { trackArtists: { include: { artist: true } } },
      take: 50,
    });

    for (const c of candidates) {
      if (normalise(c.title) !== normTitle) continue;
      const artistMatch = c.trackArtists.some((ta) => normalise(ta.artist.name) === normArtist);
      if (artistMatch) return { trackId: c.id, isNew: false };
    }
  }

  let artistRow = await db.artist.findFirst({
    where: { name: { equals: artist, mode: 'insensitive' } },
  });
  if (!artistRow) {
    artistRow = await db.artist.create({ data: { name: artist } });
  }

  const track = await db.track.create({
    data: {
      title,
      trackArtists: { create: { artistId: artistRow.id, role: 'primary' } },
    },
  });

  console.log(`[${sourceLabel}] Created stub track id=${track.id} "${title}" by "${artist}"`);
  return { trackId: track.id, isNew: true };
}
