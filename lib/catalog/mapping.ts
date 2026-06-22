// lib/catalog/mapping.ts
import { Prisma } from '@prisma/client';
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

  // Single batch upsert instead of N sequential round trips: createMany with
  // skipDuplicates handles inserts; a bulk raw UPDATE handles field updates for
  // existing rows, keyed on the composite unique index (tenantId, clientTrackId).
  //
  // The UPDATE's VALUES list is built from parameterised SQL fragments — every
  // value is bound through Prisma's tagged-template placeholders ($1, $2, …),
  // never interpolated into the query string — so it is safe from SQL injection.
  const valueRows = tracks.map(
    (t) => Prisma.sql`(${ctx.tenantId}::int, ${t.clientTrackId}::text, ${t.isrc ?? null}::text, ${t.name ?? null}::text, ${t.artistName ?? null}::text, ${t.spotifyTrackId ?? null}::text, ${t.tiktokSoundId ?? null}::text, ${t.youtubeVideoId ?? null}::text)`,
  );

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
    // Update existing rows — one bulk UPDATE via parameterised raw SQL.
    // Identifiers are quoted to match the Prisma-generated table/columns
    // ("CatalogTrack" with camelCase columns); the VALUES alias uses local
    // snake_case labels.
    db.$executeRaw`
      UPDATE "CatalogTrack" AS ct
      SET
        "isrc"           = v.isrc,
        "name"           = v.name,
        "artistName"     = v.artist_name,
        "spotifyTrackId" = v.spotify_track_id,
        "tiktokSoundId"  = v.tiktok_sound_id,
        "youtubeVideoId" = v.youtube_video_id,
        "updatedAt"      = NOW()
      FROM (VALUES ${Prisma.join(valueRows)}) AS v(
        tenant_id, client_track_id, isrc, name, artist_name,
        spotify_track_id, tiktok_sound_id, youtube_video_id
      )
      WHERE ct."tenantId" = v.tenant_id::int
        AND ct."clientTrackId" = v.client_track_id
    `,
  ]);
}
