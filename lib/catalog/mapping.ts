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
  if (tracks.length === 0) return;

  // Single batch upsert instead of N sequential round trips.
  // createMany with skipDuplicates handles the insert side; the separate
  // updateMany passes handle field updates for existing rows, keyed on the
  // composite unique index (tenantId, clientTrackId).
  await db.$transaction([
    db.catalogTrack.createMany({
      data: tracks.map((t) => ({
        tenantId:       ctx.tenantId,
        clientTrackId:  t.clientTrackId,
        isrc:           t.isrc ?? null,
        name:           t.name ?? null,
        artistName:     t.artistName ?? null,
        spotifyTrackId: t.spotifyTrackId ?? null,
        tiktokSoundId:  t.tiktokSoundId ?? null,
        youtubeVideoId: t.youtubeVideoId ?? null,
      })),
      skipDuplicates: true,
    }),
    // Update existing rows — one bulk UPDATE via raw SQL for efficiency.
    // PostgreSQL uses $N positional parameters (not MySQL-style ?).
    db.$executeRawUnsafe(
      `
      UPDATE catalog_tracks AS ct
      SET
        isrc            = v.isrc,
        name            = v.name,
        artist_name     = v.artist_name,
        spotify_track_id = v.spotify_track_id,
        tiktok_sound_id  = v.tiktok_sound_id,
        youtube_video_id = v.youtube_video_id,
        updated_at       = NOW()
      FROM (VALUES ${tracks
        .map((_, i) => {
          const b = i * 8;
          return `($${b + 1}::int, $${b + 2}::text, $${b + 3}::text, $${b + 4}::text, $${b + 5}::text, $${b + 6}::text, $${b + 7}::text, $${b + 8}::text)`;
        })
        .join(', ')}) AS v(
          tenant_id, client_track_id, isrc, name, artist_name,
          spotify_track_id, tiktok_sound_id, youtube_video_id
        )
      WHERE ct.tenant_id = v.tenant_id::int
        AND ct.client_track_id = v.client_track_id
      `,
      ...tracks.flatMap((t) => [
        ctx.tenantId,
        t.clientTrackId,
        t.isrc ?? null,
        t.name ?? null,
        t.artistName ?? null,
        t.spotifyTrackId ?? null,
        t.tiktokSoundId ?? null,
        t.youtubeVideoId ?? null,
      ]),
    ),
  ]);
}
