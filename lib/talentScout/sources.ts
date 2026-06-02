// lib/talentScout/sources.ts

import { db } from '@/lib/db';

export type TalentScoutTrack = {
  trackId: number;
  name: string;
  artists: string[];
  code2: string | null;

  // TikTok
  tiktokScore: number; // e.g. normalized rank / velocity
  tiktokViews: bigint | string;
  tiktokLikes: bigint | string;
  tiktokVelocity: number;

  // Internal streaming (Spotify / others)
  spotifyStreamsLatest: string | null;
  spotifyPopularity: number | null;

  // Luminate
  luminateStreamsLatest: string | null;
  luminateAudienceLatest: string | null; // from airplay
  luminateSpinsLatest: string | null;

  // Proprietary
  viralScore: number | null;
  rightsComplexityScore: number | null;
};

type DateRange = {
  since: string;
  until: string;
};

// Pull top TikTok breakout tracks for a given date/country (or GLOBAL)
export async function fetchTopTiktokBreakoutTracks(opts: {
  date?: string;
  code2?: string; // ISO code2 or GLOBAL
  limit?: number;
}): Promise<TalentScoutTrack[]> {
  const limit = opts.limit ?? 50;
  const code2 = opts.code2 ?? 'GLOBAL';

  // Find the most recent TikTok typed chart snapshot on or before the requested date
  const snapshotWhere = opts.date
    ? { snapshotDate: { lte: new Date(opts.date) } }
    : {};

  const snapshot = await db.tiktokTypedTrackChartSnapshot.findFirst({
    where: snapshotWhere,
    orderBy: { snapshotDate: 'desc' },
  });

  if (!snapshot) return [];

  const rows = await db.tiktokTypedTrackChartRow.findMany({
    where: { snapshotId: snapshot.id, trackId: { not: null } },
    orderBy: { rank: 'asc' },
    take: limit,
  });

  const trackIds = rows.map((r) => r.trackId!).filter(Boolean) as number[];
  if (!trackIds.length) return [];

  // Load UGC metrics for velocity data
  const ugcRows = await db.ugcTrackMetrics.findMany({
    where: {
      trackId: { in: trackIds },
      code2: code2 === 'GLOBAL' ? undefined : code2,
    },
    orderBy: { date: 'desc' },
  });
  const ugcByTrack = new Map<number, typeof ugcRows[number]>();
  for (const r of ugcRows) {
    if (!ugcByTrack.has(r.trackId)) ugcByTrack.set(r.trackId, r);
  }

  // Join to canonical tracks and basic metadata
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    include: {
      trackArtists: {
        include: { artist: true },
      },
    },
  });

  const trackById = new Map(
    tracks.map((t) => [
      t.id,
      {
        name: t.title,
        artists: t.trackArtists.map((ta) => ta.artist.name),
      },
    ]),
  );

  return rows.map((row) => {
    const tid = row.trackId!;
    const info = trackById.get(tid);
    const ugc = ugcByTrack.get(tid);
    return {
      trackId: tid,
      name: info?.name ?? 'Unknown',
      artists: info?.artists ?? [],
      code2: code2 === 'GLOBAL' ? null : code2,
      tiktokScore: computeTiktokScore({ rank: row.rank, views: row.views, velocity: ugc?.views7dGrowth ?? null }),
      tiktokViews: row.views ?? BigInt(0),
      tiktokLikes: BigInt(0),
      tiktokVelocity: ugc?.views7dGrowth ?? 0,
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
  const trackIds = tracks.map((t) => t.trackId);

  // No track_platform_stats_latest table; return tracks unchanged
  void trackIds;
  return tracks;
}

// Fetch latest Luminate streams / airplay (using new tables)
export async function hydrateLuminateMetrics(
  tracks: TalentScoutTrack[],
): Promise<TalentScoutTrack[]> {
  const trackIds = tracks.map((t) => t.trackId);

  const luminateStreams = await db.luminateStream.groupBy({
    by: ['entityId'],
    where: {
      entityType: 'track',
      entityId: { in: trackIds },
    },
    _max: { date: true },
  });

  const latestByTrack = new Map<number, Date>();
  luminateStreams.forEach((g) => latestByTrack.set(g.entityId, g._max.date!));

  const streamRows = await db.luminateStream.findMany({
    where: {
      entityType: 'track',
      entityId: { in: trackIds },
    },
  });

  const latestStreamByTrack = new Map<number, string>();
  for (const r of streamRows) {
    const latest = latestByTrack.get(r.entityId);
    if (latest && r.date.getTime() === latest.getTime()) {
      latestStreamByTrack.set(r.entityId, r.streams);
    }
  }

  const airplayRows = await db.luminateAirplay.findMany({
    where: {
      entityType: 'track',
      entityId: { in: trackIds },
    },
  });

  const latestAirplayByTrack = new Map<
    number,
    { audience: string | null; spins: string | null }
  >();
  for (const r of airplayRows) {
    const prev = latestAirplayByTrack.get(r.entityId);
    if (!prev || r.date > (prev as any).date) {
      latestAirplayByTrack.set(r.entityId, {
        audience: r.audience,
        spins: r.spins,
      });
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

  // Use provided date, or fallback to today (UTC)
  const referenceDate =
    date ??
    new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const refDateStart = new Date(referenceDate);
  const refDateEnd = new Date(referenceDate);
  refDateEnd.setUTCDate(refDateEnd.getUTCDate() + 1);

  const mlRows = await db.talentScoutScore.findMany({
    where: {
      trackId: { in: trackIds },
      date: {
        gte: refDateStart,
        lt: refDateEnd,
      },
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
