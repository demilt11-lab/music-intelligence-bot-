/**
 * Resolves a likely track/artist from an Instagram Reel caption and hashtags
 * by fuzzy-matching against existing tracks in the DB.
 *
 * Returns the matched trackId, or null if no confident match is found.
 */

import { db } from '@/lib/db';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a candidate track title and artist name from a Reel caption.
 *
 * Common caption patterns used by creators:
 *   - "Song Title - Artist Name"
 *   - "🎵 Song Title by Artist"
 *   - "using sound: Song Title"
 *   - "🎶Artist - Title"
 */
function extractFromCaption(caption: string): { title: string | null; artist: string | null } {
  if (!caption) return { title: null, artist: null };

  // Strip emoji and common prefixes
  const clean = caption
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, ' ')
    .replace(/^(using sound[:\s]+|🎵|🎶|♪|♫)/gi, '')
    .trim();

  // "Title - Artist" or "Artist - Title" (hyphen / dash separator)
  const dashMatch = clean.match(/^(.+?)\s*[-–—]\s*(.+?)(?:\s*#|\s*$)/);
  if (dashMatch) {
    const [, left, right] = dashMatch;
    return { title: left.trim(), artist: right.trim() };
  }

  // "Title by Artist"
  const byMatch = clean.match(/^(.+?)\s+by\s+(.+?)(?:\s*#|\s*$)/i);
  if (byMatch) {
    const [, title, artist] = byMatch;
    return { title: title.trim(), artist: artist.trim() };
  }

  // Fall back: treat caption up to first hashtag as a possible title
  const beforeHash = clean.split('#')[0].trim();
  if (beforeHash.length > 2 && beforeHash.length < 80) {
    return { title: beforeHash, artist: null };
  }

  return { title: null, artist: null };
}

/**
 * Extract artist/track hints from hashtags.
 * Hashtags like #arianagrande, #badguybyBillie are potential artist names.
 */
function extractFromHashtags(hashtags: string[]): string[] {
  const hints: string[] = [];
  const musicKeywords = new Set([
    'newmusic', 'viral', 'viralmusic', 'reelsmusic', 'musicreels',
    'trending', 'music', 'song', 'artist', 'pop', 'hiphop', 'rnb',
    'rap', 'edm', 'indie', 'country', 'latin',
  ]);

  for (const tag of hashtags) {
    const norm = normalise(tag.replace(/^#/, ''));
    if (!musicKeywords.has(norm) && norm.length > 2 && norm.length < 40) {
      hints.push(norm);
    }
  }
  return hints;
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Try to resolve a track from Instagram Reel caption and hashtags.
 * Returns the DB trackId or null.
 */
export async function resolveInstagramAudio(
  caption: string,
  hashtags: string[],
): Promise<number | null> {
  const { title, artist } = extractFromCaption(caption);

  // Attempt 1: title + artist exact normalised match
  if (title) {
    const normTitle = normalise(title);
    const titleToken = normTitle.split(' ')[0];
    if (!titleToken) return null;

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
      },
      take: 50,
    });

    for (const candidate of candidates) {
      const normCandTitle = normalise(candidate.title);
      if (normCandTitle !== normTitle) continue;

      // If we also have an artist hint, require it to match
      if (artist) {
        const normArtist = normalise(artist);
        const artistMatch = candidate.trackArtists.some(
          (ta) => normalise(ta.artist.name) === normArtist,
        );
        if (!artistMatch) continue;
      }

      return candidate.id;
    }
  }

  // Attempt 2: hashtag-based artist lookup
  const hints = extractFromHashtags(hashtags);
  for (const hint of hints) {
    const artists = await db.artist.findMany({
      where: {
        name: { contains: hint, mode: 'insensitive' },
      },
      include: {
        trackArtists: {
          include: { track: true },
          take: 1,
          orderBy: { track: { popularity: 'desc' } },
        },
      },
      take: 3,
    });

    for (const a of artists) {
      if (normalise(a.name) === hint && a.trackArtists.length > 0) {
        return a.trackArtists[0].track.id;
      }
    }
  }

  return null;
}
