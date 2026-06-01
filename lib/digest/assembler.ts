import { ScoutScore, ScoutSources } from '@/lib/engine';
import { db } from '@/lib/db';
import { emptyTrack } from '@/lib/talentScout/emptyTrack';
import type { TalentScoutTrack as ScoreTrack } from '@/lib/talentScout/score';

export type DigestTrack = {
  trackId: number;
  name: string;
  artists: string[];
  viralScore: number | null;
  trendLabel: string | null;
  tiktokVelocity: number;
  spotifyStreams: string | null;
};

export type DigestArtist = {
  artistId: number;
  name: string;
  status: string;
  breakProbability: number | null;
  streams7dDelta: number | null;
};

export type WatchlistAlert = {
  entityType: string;
  entityId: number;
  viralScore: number | null;
  viralScoreDelta: number | null;
  message: string;
};

export type DigestPayload = {
  headline: string;
  generatedAt: string;
  breakoutTracks: DigestTrack[];
  breakingArtists: DigestArtist[];
  watchlistAlerts: WatchlistAlert[];
};

export async function assembleDigest(tenantId: number, tenantName: string, date?: string): Promise<DigestPayload> {
  const today = date ?? new Date().toISOString().slice(0, 10);

  const ranked = await ScoutSources.fetchTopTiktokBreakoutTracks({ date: today, code2: 'GLOBAL', limit: 10 });

  const breakoutTracks: DigestTrack[] = (ranked as ScoreTrack[]).map((t) => ({
    trackId: t.trackId,
    name: t.name,
    artists: t.artists,
    viralScore: t.viralScore,
    trendLabel: null,
    tiktokVelocity: t.tiktokViews7dGrowth,
    spotifyStreams: t.spotifyStreamsLatest,
  }));

  const breakingArtistRows = await db.artistTrajectorySnapshot.findMany({
    where: { status: 'ABOUT_TO_BREAK' },
    orderBy: { breakProbability: 'desc' },
    take: 5,
  });

  const artistIds: number[] = breakingArtistRows.map((r: { artistId: number }) => r.artistId);
  const artists = await db.artist.findMany({ where: { id: { in: artistIds } } });
  const artistMap = new Map((artists as Array<{ id: number; name: string }>).map((a) => [a.id, a.name]));

  const breakingArtists: DigestArtist[] = (breakingArtistRows as Array<{ artistId: number; status: string; breakProbability: number | null; streams7dDelta: number }>).map((r) => ({
    artistId: r.artistId,
    name: artistMap.get(r.artistId) ?? `Artist ${r.artistId}`,
    status: r.status,
    breakProbability: r.breakProbability,
    streams7dDelta: r.streams7dDelta,
  }));

  const watchlistItems = await db.watchlistItem.findMany({
    where: { tenantId, entityType: 'track' },
  });

  const watchlistAlerts: WatchlistAlert[] = [];
  if (watchlistItems.length) {
    const withMl = await ScoutSources.hydrateMlSignals(
      (watchlistItems as Array<{ entityId: number }>).map((i) => emptyTrack(i.entityId)),
      today,
    );

    for (const item of (watchlistItems as Array<{ entityId: number; notes: string | null }>)) {
      const live = withMl.find((t) => t.trackId === item.entityId);
      const baseline = item.notes
        ? (JSON.parse(item.notes) as { baselineViralScore?: number | null })
        : null;
      const delta =
        live?.viralScore != null && baseline?.baselineViralScore != null
          ? live.viralScore - baseline.baselineViralScore
          : null;

      if (delta !== null && delta >= 0.1) {
        watchlistAlerts.push({
          entityType: 'track',
          entityId: item.entityId,
          viralScore: live?.viralScore ?? null,
          viralScoreDelta: delta,
          message: `Viral score jumped +${(delta * 100).toFixed(1)}% since you added it`,
        });
      }
    }
  }

  const dateLabel = new Date(today).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return {
    headline: `Your A&R Radar — ${dateLabel} | ${tenantName}`,
    generatedAt: new Date().toISOString(),
    breakoutTracks,
    breakingArtists,
    watchlistAlerts,
  };
}
