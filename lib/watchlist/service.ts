// lib/watchlist/service.ts
//
// Shared watchlist logic used by both the key-authenticated v1 API and the
// first-party UI routes. Entries are enriched with entity names and the
// latest viral score (plus delta vs the baseline captured when the item
// was added) so list views can show real context, not bare IDs.
import { db } from '@/lib/db';
import { ScoutSources } from '@/lib/engine';
import { emptyTrack } from '@/lib/talentScout/emptyTrack';

export type WatchlistEntry = {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string | null;
  artistNames: string[];
  addedAt: Date;
  viralScore: number | null;
  viralScoreDelta: number | null;
  trendLabel: string | null;
};

type NotesBaseline = { baselineViralScore?: number | null };

function parseBaseline(notes: string | null): NotesBaseline | null {
  if (!notes) return null;
  try {
    return JSON.parse(notes) as NotesBaseline;
  } catch {
    return null;
  }
}

export async function listWatchlist(tenantId: number): Promise<WatchlistEntry[]> {
  const items = await db.watchlistItem.findMany({
    where: { tenantId },
    orderBy: { addedAt: 'desc' },
  });

  const trackIds = items
    .filter((i) => i.entityType === 'track')
    .map((i) => i.entityId);
  const artistIds = items
    .filter((i) => i.entityType === 'artist')
    .map((i) => i.entityId);

  const [tracks, artists, withMl, trendLabels] = await Promise.all([
    trackIds.length
      ? db.track.findMany({
          where: { id: { in: trackIds } },
          include: { trackArtists: { include: { artist: true } } },
        })
      : Promise.resolve([]),
    artistIds.length
      ? db.artist.findMany({ where: { id: { in: artistIds } } })
      : Promise.resolve([]),
    trackIds.length
      ? ScoutSources.hydrateMlSignals(trackIds.map(emptyTrack))
      : Promise.resolve([]),
    trackIds.length
      ? db.trackTrendLabel.findMany({
          where: { trackId: { in: trackIds }, label: { not: 'NONE' } },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const artistById = new Map(artists.map((a) => [a.id, a]));
  const viralByTrack = new Map(withMl.map((t) => [t.trackId, t.viralScore]));
  const trendByTrack = new Map<number, string>();
  for (const l of trendLabels) {
    if (!trendByTrack.has(l.trackId)) trendByTrack.set(l.trackId, l.label);
  }

  return items.map((item) => {
    const baseline = parseBaseline(item.notes);
    const isTrack = item.entityType === 'track';
    const track = isTrack ? trackById.get(item.entityId) : undefined;
    const artist = !isTrack ? artistById.get(item.entityId) : undefined;

    const viralScore = isTrack ? viralByTrack.get(item.entityId) ?? null : null;
    const viralScoreDelta =
      viralScore != null && baseline?.baselineViralScore != null
        ? viralScore - baseline.baselineViralScore
        : null;

    return {
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: track?.title ?? artist?.name ?? null,
      artistNames: track?.trackArtists.map((ta) => ta.artist.name) ?? [],
      addedAt: item.addedAt,
      viralScore,
      viralScoreDelta,
      trendLabel: isTrack ? trendByTrack.get(item.entityId) ?? null : null,
    };
  });
}

export async function addWatchlistItem(
  tenantId: number,
  entityType: 'track' | 'artist',
  entityId: number,
) {
  let notes: string | null = null;
  if (entityType === 'track') {
    const [withMl] = await ScoutSources.hydrateMlSignals([emptyTrack(entityId)]);
    notes = JSON.stringify({
      baselineViralScore: withMl?.viralScore ?? null,
      addedAt: new Date().toISOString(),
    });
  }

  return db.watchlistItem.upsert({
    where: {
      tenantId_entityType_entityId: { tenantId, entityType, entityId },
    },
    update: {},
    create: { tenantId, entityType, entityId, notes },
  });
}

/** Remove by row id, scoped to tenant. Returns true if a row was deleted. */
export async function removeWatchlistItemById(
  tenantId: number,
  id: number,
): Promise<boolean> {
  const { count } = await db.watchlistItem.deleteMany({
    where: { id, tenantId },
  });
  return count > 0;
}

/** Remove by entity reference (used by toggle buttons). */
export async function removeWatchlistItemByEntity(
  tenantId: number,
  entityType: string,
  entityId: number,
): Promise<boolean> {
  const { count } = await db.watchlistItem.deleteMany({
    where: { tenantId, entityType, entityId },
  });
  return count > 0;
}

export async function isOnWatchlist(
  tenantId: number,
  entityType: string,
  entityId: number,
): Promise<boolean> {
  const item = await db.watchlistItem.findFirst({
    where: { tenantId, entityType, entityId },
    select: { id: true },
  });
  return !!item;
}
