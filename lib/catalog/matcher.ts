// lib/catalog/matcher.ts
import { db } from '@/lib/db';
import { searchService } from '@/lib/search';
import {
  resolveTrackByIsrc,
  resolveTrackByExternalIds,
} from '@/lib/tracks/canonical';

type MatchOptions = {
  tenantId: number;
  batchSize?: number;
};

export async function matchTenantCatalogToCanonicalTracks(
  { tenantId, batchSize = 100 }: MatchOptions,
) {
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
  // 1. ISRC
  if (row.isrc) {
    const id = await resolveTrackByIsrc(row.isrc);
    if (id) return id;
  }

  // 2. External IDs
  const externalId = await resolveTrackByExternalIds({
    spotifyTrackId: row.spotifyTrackId,
    appleMusicTrackId: row.appleMusicTrackId,
    youtubeVideoId: row.youtubeVideoId,
    tiktokSoundId: row.tiktokSoundId,
  });
  if (externalId) return externalId;

  // 3. Fallback: search by name + artist
  if (row.name && row.artistName) {
    const res = await searchService.search({
      q: `${row.name} ${row.artistName}`,
      type: 'tracks',
      limit: 1,
    } as any);

    const track =
      res.obj?.tracks && res.obj.tracks[0];
    if (track?.id) return track.id;
  }

  return null;
}
