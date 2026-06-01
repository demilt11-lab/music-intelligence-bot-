import { db } from '@/lib/db';

export async function resolveLinkToTrack(url: string) {
  // Extract ISRC or platform ID from URL
  const spotifyMatch = url.match(/track\/([A-Za-z0-9]+)/);
  if (spotifyMatch) {
    const externalId = await db.externalId.findFirst({
      where: { platform: 'spotify', externalId: spotifyMatch[1], entityType: 'track' },
    });
    if (externalId) {
      return db.track.findUnique({ where: { id: externalId.entityId } });
    }
  }
  return null;
}
