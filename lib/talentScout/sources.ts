// lib/talentScout/sources.ts

import { db } from '@/lib/db';

export type TalentScoutTrack = {
  trackId: number;
  name: string;
  artists: string[];
  code2: string | null;

  // TikTok
  tiktokScore: number;
  tiktokViews: bigint | string;
  tiktokLikes: bigint | string;
  tiktokVelocity: number;

  // Internal streaming (Spotify / others)
  spotifyStreamsLatest: string | null;
  spotifyPopularity: number | null;

  // Luminate
  luminateStreamsLatest: string | null;
  luminateAudienceLatest: string | null;
  luminateSpinsLatest: string | null;

  // Proprietary
  viralScore: number | null;
  rightsComplexityScore: number | null;
};

// Pull top breakout tracks — prefers UGC data, falls back to talent scout scores from ETL
export async function fetchTopTiktokBreakoutTracks(opts: {
  date?: string;
  code2?: string;
  limit?: number;
}): Promise<TalentScoutTrack[]> {
  const limit = opts.limit ?? 50;
  const code2 = opts.code2 ?? 'GLOBAL';
  const dateFilter = opts.date ? { lte: new Date(opts.date) } : undefined;

  // ── Try UGC metrics first (populated when TikTok API is configured) ──
  const resolvedCode2 = code2 === 'GLOBAL' ? 'GLOBAL' : (
    await db.ugcTrackMetrics.findFirst({
      where: { code2, ...(dateFilter ? { date: dateFilter } : {}) },
      select: { code2: true },
    })
  )?.code2 ?? 'GLOBAL';

  const latestUgc = await db.ugcTrackMetrics.findFirst({
    where: { code2: resolvedCode2, ...(dateFilter ? { date: dateFilter } : {}) },
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  if (latestUgc) {
    const ugcRows = await db.ugcTrackMetrics.findMany({
      where: { date: latestUgc.date, code2: resolvedCode2, views7d: { gt: 0 } },
      orderBy: { views7d: 'desc' },
      take: limit,
    });
    if (ugcRows.length) {
      const trackById = await loadTrackMeta(ugcRows.map((r) => r.trackId));
      return ugcRows.map((ugc, i) => {
        const info = trackById.get(ugc.trackId);
        return {
          trackId: ugc.trackId,
          name: info?.name ?? 'Unknown',
          artists: info?.artists ?? [],
          code2: code2 === 'GLOBAL' ? null : code2,
          tiktokScore: computeTiktokScore({ rank: i + 1, views: ugc.views7d, velocity: ugc.views7dGrowth }),
          tiktokViews: ugc.views7d,
          tiktokLikes: BigInt(0),
          tiktokVelocity: ugc.views7dGrowth,
          spotifyStreamsLatest: null,
          spotifyPopularity: null,
          luminateStreamsLatest: null,
          luminateAudienceLatest: null,
          luminateSpinsLatest: null,
          viralScore: null,
          rightsComplexityScore: null,
        };
      });
    }
  }

  // ── Fallback: use talent_scout_scores populated by the ETL ──
  const scoreCode2 = code2 === 'GLOBAL' ? 'GLOBAL' : code2;

  // Try requested code2 first, then GLOBAL
  const latestScore = await db.talentScoutScore.findFirst({
    where: {
      code2: { in: [scoreCode2, 'GLOBAL'] },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'desc' },
    select: { date: true, code2: true },
  });

  if (!latestScore) return [];

  const scoreRows = await db.talentScoutScore.findMany({
    where: { date: latestScore.date, code2: latestScore.code2 },
    orderBy: { viralScore: 'desc' },
    take: limit,
  });

  if (!scoreRows.length) return [];

  const trackById = await loadTrackMeta(scoreRows.map((r) => r.trackId));

  return scoreRows.map((s, i) => {
    const info = trackById.get(s.trackId);
    return {
      trackId: s.trackId,
      name: info?.name ?? 'Unknown',
      artists: info?.artists ?? [],
      code2: latestScore.code2 === 'GLOBAL' ? null : latestScore.code2,
      tiktokScore: s.viralScore * Math.max(0, 1 - i / scoreRows.length),
      tiktokViews: BigInt(0),
      tiktokLikes: BigInt(0),
      tiktokVelocity: 0,
      spotifyStreamsLatest: null,
      spotifyPopularity: null,
      luminateStreamsLatest: null,
      luminateAudienceLatest: null,
      luminateSpinsLatest: null,
      viralScore: s.viralScore,
      rightsComplexityScore: s.rightsComplexityScore,
    };
  });
}

async function loadTrackMeta(trackIds: number[]) {
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    include: { trackArtists: { include: { artist: true } } },
  });
  return new Map(tracks.map((t) => [t.id, {
    name: t.title,
    artists: t.trackArtists.map((ta) => ta.artist.name),
  }]));
}

function computeTiktokScore(row: {
  rank: number | null;
  velocity: number | null;
  views: bigint | string | null;
}) {
  const rankComponent = row.rank ? 1 / row.rank : 0;
  const velocityComponent = Math.min(row.velocity ?? 0, 5) / 5;
  const viewsComponent = Number(row.views ?? 0) > 0 ? Math.log10(Number(row.views)) / 10 : 0;
  return rankComponent * 0.5 + velocityComponent * 0.3 + viewsComponent * 0.2;
}

// Fetch latest internal Spotify stats for a set of tracks
export async function hydrateInternalStreaming(
  tracks: TalentScoutTrack[],
): Promise<TalentScoutTrack[]> {
  void tracks.map((t) => t.trackId);
  return tracks;
}

// Fetch latest Luminate streams / airplay (using new tables)
export async function hydrateLuminateMetrics(
  tracks: TalentScoutTrack[],
): Promise<TalentScoutTrack[]> {
  const trackIds = tracks.map((t) => t.trackId);

  const luminateStreams = await db.luminateStream.groupBy({
    by: ['entityId'],
    where: { entityType: 'track', entityId: { in: trackIds } },
    _max: { date: true },
  });

  const latestByTrack = new Map<number, Date>();
  luminateStreams.forEach((g) => latestByTrack.set(g.entityId, g._max.date!));

  const streamRows = await db.luminateStream.findMany({
    where: { entityType: 'track', entityId: { in: trackIds } },
  });

  const latestStreamByTrack = new Map<number, string>();
  for (const r of streamRows) {
    const latest = latestByTrack.get(r.entityId);
    if (latest && r.date.getTime() === latest.getTime()) {
      latestStreamByTrack.set(r.entityId, r.streams);
    }
  }

  const airplayRows = await db.luminateAirplay.findMany({
    where: { entityType: 'track', entityId: { in: trackIds } },
  });

  const latestAirplayByTrack = new Map<number, { audience: string | null; spins: string | null }>();
  for (const r of airplayRows) {
    const prev = latestAirplayByTrack.get(r.entityId);
    if (!prev || r.date > (prev as any).date) {
      latestAirplayByTrack.set(r.entityId, { audience: r.audience, spins: r.spins });
    }
  }

  return tracks.map((t) => {
    const streams = latestStreamByTrack.get(t.trackId) ?? null;
    const airplay = latestAirplayByTrack.get(t.trackId);
    return {
      ...t,
      luminateStreamsLatest: streams,
      luminateAudienceLatest: airplay?.audience ?? null,
      luminateSpinsLatest: airplay?.spins ?? null,
    };
  });
}

export async function hydrateMlSignals(
  tracks: TalentScoutTrack[],
  date?: string,
): Promise<TalentScoutTrack[]> {
  if (!tracks.length) return tracks;
  const trackIds = tracks.map((t) => t.trackId);

  const referenceDate = date ?? new Date().toISOString().slice(0, 10);
  const refDateStart = new Date(referenceDate);
  const refDateEnd = new Date(referenceDate);
  refDateEnd.setUTCDate(refDateEnd.getUTCDate() + 1);

  const mlRows = await db.talentScoutScore.findMany({
    where: {
      trackId: { in: trackIds },
      date: { gte: refDateStart, lt: refDateEnd },
    },
  });

  const byTrack = new Map<number, (typeof mlRows)[number]>();
  mlRows.forEach((r) => byTrack.set(r.trackId, r));

  return tracks.map((t) => {
    const m = byTrack.get(t.trackId);
    return {
      ...t,
      viralScore: m?.viralScore ?? t.viralScore,
      rightsComplexityScore: m?.rightsComplexityScore ?? t.rightsComplexityScore,
    };
  });
}
