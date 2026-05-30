// lib/catalog/matcher.ts
import { db } from '@/lib/db';
import { searchService } from '@/lib/search';

type MatchOptions = {
  tenantId: number;
  batchSize?: number;
};

export async function matchTenantCatalogToCanonicalTracks(
  { tenantId, batchSize = 100 }: MatchOptions,
) {
  // find catalog entries without canonicalTrackId
  const catalog = await db.catalogTrack.findMany({
    where: {
      tenantId,
      canonicalTrackId: null,
    },
    take: batchSize,
  });

  for (const row of catalog) {
    const canonicalId = await resolveCatalogRowToTrack(row);
    if (!canonicalId) continue;

    await db.catalogTrack.update({
      where: {
        tenantId_clientTrackId: {
          tenantId,
          clientTrackId: row.clientTrackId,
        },
      },
      data: {
        canonicalTrackId: canonicalId,
      },
    });
  }
}

async function resolveCatalogRowToTrack(row: any): Promise<number | null> {
  // 1) Try ISRC exact match
  if (row.isrc) {
    const track = await db.track.findFirst({
      where: { isrc: row.isrc },
      select: { id: true },
    });
    if (track) return track.id;
  }

  // 2) Try external IDs if present
  if (row.spotifyTrackId) {
    const external = await db.externalTrackId.findFirst({
      where: { spotifyTrackId: row.spotifyTrackId },
      select: { trackId: true },
    });
    if (external) return external.trackId;
  }

  if (row.youtubeVideoId) {
    const external = await db.externalTrackId.findFirst({
      where: { youtubeVideoId: row.youtubeVideoId },
      select: { trackId: true },
    });
    if (external) return external.trackId;
  }

  if (row.tiktokSoundId) {
    const external = await db.externalTrackId.findFirst({
      where: { tiktokSoundId: row.tiktokSoundId },
      select: { trackId: true },
    });
    if (external) return external.trackId;
  }

  // 3) Fallback: name + artist search
  if (row.name && row.artistName) {
    const result = await searchService.search({
      q: `${row.name} ${row.artistName}`,
      type: 'tracks',
      limit: 1,
    } as any);

    const track =
      result.obj?.tracks && result.obj.tracks[0];
    if (track?.id) return track.id;
  }

  return null;
}
