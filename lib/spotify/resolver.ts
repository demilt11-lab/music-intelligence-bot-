// lib/spotify/resolver.ts
//
// Given a Spotify track object, find (or create) the corresponding DB Track
// record, along with Artist, TrackArtist and ExternalId records.

import { db } from '@/lib/db';
import type { SpotifyTrack } from './client';

export interface ResolvedTrack {
  trackId: number;
  created: boolean;
}

/**
 * Find an existing Track by ISRC (via external_ids) or by exact title match
 * as a fallback. If no match is found, create Track + Artist + linking records.
 */
export async function resolveSpotifyTrack(spotifyTrack: SpotifyTrack): Promise<ResolvedTrack> {
  const isrc = spotifyTrack.external_ids?.isrc ?? null;

  // ── 1. Try to find by ISRC ────────────────────────────────────────────────
  if (isrc) {
    const existing = await db.track.findUnique({ where: { isrc } });
    if (existing) {
      // Ensure Spotify external ID is present
      await ensureSpotifyExternalId(existing.id, spotifyTrack.id);
      return { trackId: existing.id, created: false };
    }
  }

  // ── 2. Try to find by existing Spotify external ID ────────────────────────
  const bySpotifyId = await db.externalId.findFirst({
    where: { entityType: 'track', platform: 'spotify', externalId: spotifyTrack.id },
  });
  if (bySpotifyId) {
    return { trackId: bySpotifyId.entityId, created: false };
  }

  // ── 3. Create new track ───────────────────────────────────────────────────
  const releaseDate = parseReleaseDate(spotifyTrack.album?.release_date);

  const track = await db.track.create({
    data: {
      isrc,
      title: spotifyTrack.name,
      durationMs: spotifyTrack.duration_ms ?? null,
      explicit: spotifyTrack.explicit ?? false,
      releaseDate,
      previewUrl: spotifyTrack.preview_url ?? null,
      coverUrl: spotifyTrack.album?.images?.[0]?.url ?? null,
      popularity: spotifyTrack.popularity ?? null,
    },
  });

  // Spotify external ID for the track
  await db.externalId.create({
    data: {
      entityType: 'track',
      entityId: track.id,
      platform: 'spotify',
      externalId: spotifyTrack.id,
    },
  });

  // ── 4. Resolve artists ────────────────────────────────────────────────────
  for (let i = 0; i < (spotifyTrack.artists ?? []).length; i++) {
    const spotifyArtist = spotifyTrack.artists[i];
    const artist = await resolveArtist(spotifyArtist.id, spotifyArtist.name);

    // TrackArtist link (upsert in case of retry)
    await db.trackArtist.upsert({
      where: { trackId_artistId: { trackId: track.id, artistId: artist.id } },
      create: { trackId: track.id, artistId: artist.id, role: 'main', position: i },
      update: { position: i },
    });
  }

  return { trackId: track.id, created: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveArtist(
  spotifyArtistId: string,
  name: string,
): Promise<{ id: number }> {
  // Check existing Spotify external ID for an artist
  const extId = await db.externalId.findFirst({
    where: { entityType: 'artist', platform: 'spotify', externalId: spotifyArtistId },
  });

  if (extId) {
    return { id: extId.entityId };
  }

  // Create a new Artist
  const artist = await db.artist.create({
    data: { name },
  });

  await db.externalId.create({
    data: {
      entityType: 'artist',
      entityId: artist.id,
      platform: 'spotify',
      externalId: spotifyArtistId,
    },
  });

  return { id: artist.id };
}

async function ensureSpotifyExternalId(trackId: number, spotifyId: string): Promise<void> {
  await db.externalId.upsert({
    where: {
      entityType_entityId_platform: {
        entityType: 'track',
        entityId: trackId,
        platform: 'spotify',
      },
    },
    create: {
      entityType: 'track',
      entityId: trackId,
      platform: 'spotify',
      externalId: spotifyId,
    },
    update: { externalId: spotifyId },
  });
}

function parseReleaseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  // Spotify returns "YYYY", "YYYY-MM", or "YYYY-MM-DD"
  if (/^\d{4}$/.test(dateStr)) return new Date(`${dateStr}-01-01`);
  if (/^\d{4}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}-01`);
  return new Date(dateStr);
}
