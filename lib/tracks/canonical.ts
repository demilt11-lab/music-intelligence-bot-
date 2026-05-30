// lib/tracks/canonical.ts
import { db } from '@/lib/db';

export async function resolveTrackByIsrc(isrc: string) {
  if (!isrc) return null;
  const track = await db.track.findFirst({
    where: { isrc },
    select: { id: true },
  });
  return track?.id ?? null;
}

export async function resolveTrackByExternalIds(opts: {
  spotifyTrackId?: string | null;
  appleMusicTrackId?: string | null;
  youtubeVideoId?: string | null;
  tiktokSoundId?: string | null;
}) {
  const clauses = [];

  if (opts.spotifyTrackId) {
    clauses.push({ spotifyTrackId: opts.spotifyTrackId });
  }
  if (opts.appleMusicTrackId) {
    clauses.push({ appleMusicTrackId: opts.appleMusicTrackId });
  }
  if (opts.youtubeVideoId) {
    clauses.push({ youtubeVideoId: opts.youtubeVideoId });
  }
  if (opts.tiktokSoundId) {
    clauses.push({ tiktokSoundId: opts.tiktokSoundId });
  }

  if (!clauses.length) return null;

  const external = await db.externalTrackId.findFirst({
    where: { OR: clauses as any[] },
    select: { trackId: true },
  });

  return external?.trackId ?? null;
}
