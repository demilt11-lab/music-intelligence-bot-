// lib/catalog/mapping.ts
import { db } from '@/lib/db';
import type { RequestContext } from '@/lib/platform/context';

export type CatalogTrackInput = {
  clientTrackId: string;
  isrc?: string | null;
  name?: string | null;
  artistName?: string | null;
  spotifyTrackId?: string | null;
  tiktokSoundId?: string | null;
  youtubeVideoId?: string | null;
};

export async function upsertCatalogTracks(
  ctx: RequestContext,
  tracks: CatalogTrackInput[],
): Promise<void> {
  for (const t of tracks) {
    await db.catalogTrack.upsert({
      where: {
        tenantId_clientTrackId: {
          tenantId: ctx.tenantId,
          clientTrackId: t.clientTrackId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        clientTrackId: t.clientTrackId,
        isrc: t.isrc ?? null,
        name: t.name ?? null,
        artistName: t.artistName ?? null,
        spotifyTrackId: t.spotifyTrackId ?? null,
        tiktokSoundId: t.tiktokSoundId ?? null,
        youtubeVideoId: t.youtubeVideoId ?? null,
      },
      update: {
        isrc: t.isrc ?? null,
        name: t.name ?? null,
        artistName: t.artistName ?? null,
        spotifyTrackId: t.spotifyTrackId ?? null,
        tiktokSoundId: t.tiktokSoundId ?? null,
        youtubeVideoId: t.youtubeVideoId ?? null,
      },
    });
  }
}
