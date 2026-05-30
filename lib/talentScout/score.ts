// lib/talentScout/sources.ts

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

export type TalentScoutTrack = {
  trackId: number;
  name: string;
  artists: string[];
  code2: string | null;

  // UGC (TikTok; extend with Shorts/Reels when available)
  tiktokVideos7d: number;
  tiktokVideos7dGrowth: number;
  tiktokViews7d: number;
  tiktokViews7dGrowth: number;
  tiktokRankDelta7d: number;

  // Internal streaming (Spotify / others)
  spotifyStreamsLatest: string | null;
  spotifyStreams7d: number | null;
  spotifyStreams7dGrowth: number | null;
  spotifyPopularity: number | null;

  // Luminate streams / airplay
  luminateStreamsLatest: string | null;
  luminateStreams7d: number | null;
  luminateStreams7dGrowth: number | null;
  luminateAudienceLatest: string | null;
  luminateSpinsLatest: string | null;

  // Proprietary / ML
  viralScore: number | null;
  rightsComplexityScore: number | null;
};

type DailyOptions = {
  date?: string; // ISO date; if omitted, use latest in TikTok table
  code2?: string; // country code or GLOBAL
  limit?: number;
};

/**
 * Fetch top UGC breakout tracks (TikTok) with 7d aggregates.
 * Assumes you have a tiktok_track_chart_breakout or similar table.
 */
export async function fetchTopUgcBreakoutTracks(
  opts: DailyOptions,
): Promise<TalentScoutTrack[]> {
  const limit = opts.limit ?? 50;
  const code2 = opts.code2 ?? 'GLOBAL';

  // latest date if not provided
  const latestRow =
    !opts.date &&
    (await db.tiktok_track_chart_breakout.findFirst({
      where: { code2 },
      orderBy: { source_date: 'desc' },
    }));

  const targetDate = opts.date ?? latestRow?.source_date?.toISOString()?.slice(0, 10);

  if (!targetDate) return [];

  const rows = await db.tiktok_track_chart_breakout.findMany({
    where: {
      code2,
      source_date: new Date(targetDate),
    },
    orderBy: { rank: 'asc' },
    take: limit,
  });

  const trackIds = rows.map((r) => r.linked_track_id).filter(Boolean) as number[];
  if (!trackIds.length) return [];

  const tracks = await db.tracks.findMany({
    where: { id: { in: trackIds } },
    include: {
      track_artists: {
        include: { artists: true },
      },
    },
  });

  const trackById = new Map(
    tracks.map((t) => [
      t.id,
      {
        name: t.name,
        artists: t.track_artists.map((ta) => ta.artists.name),
        code2: t.code2 ?? null,
      },
    ]),
  );

  // Here we assume you have precomputed 7d stats or deltas on the TikTok table;
  // if not, you can add fields views_7d, views_7d_growth, videos_7d, etc.
  return rows.map((row) => {
    const info = trackById.get(row.linked_track_id ?? 0);

    return {
      trackId: row.linked_track_id ?? 0,
      name: info?.name ?? 'Unknown',
      artists: info?.artists ?? [],
      code2: info?.code2 ?? code2,

      tiktokVideos7d: Number(row.videos_7d ?? 0),
      tiktokVideos7dGrowth: Number(row.videos_7d_growth ?? 0),
      tiktokViews7d: Number(row.views_7d ?? 0),
      tiktokViews7dGrowth: Number(row.views_7d_growth ?? 0),
      tiktokRankDelta7d: Number(row.rank_delta_7d ?? 0),

      spotifyStreamsLatest: null,
      spotifyStreams7d: null,
      spotifyStreams7dGrowth: null,
      spotifyPopularity: null,

      luminateStreamsLatest: null,
      luminateStreams7d: null,
      luminateStreams7dGrowth: null,
      luminateAudienceLatest: null,
      luminateSpinsLatest: null,

      viralScore: null,
      rightsComplexityScore: null,
    };
  });
}

/**
 * Hydrate internal streaming metrics (Spotify) for a set of tracks.
 * Assumes track_platform_stats_daily and track_platform_stats_latest tables.
 */
export async function hydrateInternalStreaming(
  tracks: TalentScoutTrack[],
): Promise<TalentScoutTrack[]> {
  if (!tracks.length) return tracks;
  const trackIds = tracks.map((t) => t.trackId);

  const latest = await db.track_platform_stats_latest.findMany({
    where: {
      track_id: { in: trackIds },
      platform: 'spotify',
    },
  });

  const daily7d = await db.track_platform_stats_daily.groupBy({
    by: ['track_id'],
    where: {
      track_id: { in: trackIds },
      platform: 'spotify',
      // assume you restrict to last 7 days in ETL, or filter by date here
    },
    _sum: { streams: true },
  });

  const latestByTrack = new Map<number, (typeof latest)[number]>();
  latest.forEach((s) => latestByTrack.set(s.track_id, s));

  const streams7dByTrack = new Map<number, number>();
  daily7d.forEach((g) =>
    streams7dByTrack.set(g.track_id, Number(g._sum.streams ?? 0)),
  );

  return tracks.map((t) => {
    const latestRow = latestByTrack.get(t.trackId);
    const sevenDay = streams7dByTrack.get(t.trackId);

    return {
      ...t,
      spotifyStreamsLatest: latestRow?.streams ?? null,
      spotifyPopularity: latestRow?.popularity ?? null,
      spotifyStreams7d: sevenDay ?? null,
      // Place-holder; you can compute growth vs prior 7 days in ETL
      spotifyStreams7dGrowth: latestRow?.streams_7d_growth
        ? Number(latestRow.streams_7d_growth)
        : null,
    };
  });
}

/**
 * Hydrate Luminate streams and airplay metrics for a set of tracks.
 * Uses LuminateStream and LuminateAirplay Prisma models.
 */
export async function hydrateLuminateMetrics(
  tracks: TalentScoutTrack[],
): Promise<TalentScoutTrack[]> {
  if (!tracks.length) return tracks;
  const trackIds = tracks.map((t) => t.trackId);

  const streamRows = await db.luminateStream.findMany({
    where: {
      entityType: 'track',
      entityId: { in: trackIds },
    },
  });

  const latestStreamByTrack = new Map<
    number,
    { date: Date; streams: string; streams7d?: number; streams7dGrowth?: number }
  >();

  for (const r of streamRows) {
    const prev = latestStreamByTrack.get(r.entityId);
    if (!prev || r.date > prev.date) {
      latestStreamByTrack.set(r.entityId, {
        date: r.date,
        streams: r.streams,
        streams7d: Number(r.streams_7d ?? 0),
        streams7dGrowth: Number(r.streams_7d_growth ?? 0),
      });
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
    { date: Date; audience: string | null; spins: string | null }
  >();
  for (const r of airplayRows) {
    const prev = latestAirplayByTrack.get(r.entityId);
    if (!prev || r.date > prev.date) {
      latestAirplayByTrack.set(r.entityId, {
        date: r.date,
        audience: r.audience,
        spins: r.spins,
      });
    }
  }

  return tracks.map((t) => {
    const s = latestStreamByTrack.get(t.trackId);
    const a = latestAirplayByTrack.get(t.trackId);

    return {
      ...t,
      luminateStreamsLatest: s?.streams ?? null,
      luminateStreams7d: s?.streams7d ?? null,
      luminateStreams7dGrowth: s?.streams7dGrowth ?? null,
      luminateAudienceLatest: a?.audience ?? null,
      luminateSpinsLatest: a?.spins ?? null,
    };
  });
  // lib/talentScout/score.ts

import { TalentScoutTrack } from './sources';

export type TalentScoutAction = {
  type:
    | 'ugc_double_down'
    | 'playlist_pitch'
    | 'geo_focus'
    | 'radio_watch'
    | 'rights_cleanup';
  description: string;
  expectedImpact: string;
};

export type TalentScoutRankedTrack = TalentScoutTrack & {
  totalScore: number;
  actions: TalentScoutAction[];
};

export type TalentScoutMode = 'ugc_early' | 'general';

export function rankTalentTracks(
  tracks: TalentScoutTrack[],
  mode: TalentScoutMode = 'ugc_early',
): TalentScoutRankedTrack[] {
  const scored = tracks
    .filter((t) => filterPreBreak(t, mode))
    .map((t) => {
      const totalScore =
        mode === 'ugc_early'
          ? computeUgcEarlyScore(t)
          : computeGeneralScore(t);
      return {
        ...t,
        totalScore,
        actions: buildActions(t, totalScore),
      };
    });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

function filterPreBreak(t: TalentScoutTrack, mode: TalentScoutMode): boolean {
  if (mode !== 'ugc_early') return true;
  const spotify = Number(t.spotifyStreamsLatest ?? 0);
  const luminate = Number(t.luminateStreamsLatest ?? 0);
  // Filter out already big hits (e.g., > 20M total streams)
  const combined = spotify + luminate;
  return combined < 20_000_000;
}

function computeUgcEarlyScore(t: TalentScoutTrack): number {
  const ugcGrowth =
    growthScore(t.tiktokVideos7dGrowth) * 0.4 +
    growthScore(t.tiktokViews7dGrowth) * 0.3 +
    (t.tiktokRankDelta7d < 0 ? Math.min(0.3, Math.abs(t.tiktokRankDelta7d) / 50) : 0); // rising rank

  const streamsGrowth =
    growthScore(t.spotifyStreams7dGrowth ?? 0) * 0.15 +
    growthScore(t.luminateStreams7dGrowth ?? 0) * 0.1;

  const baselinePenalty = baselineSizePenalty(
    t.spotifyStreamsLatest,
    t.luminateStreamsLatest,
  );

  const rightsPenalty = (t.rightsComplexityScore ?? 0) * 0.1;

  return ugcGrowth + streamsGrowth - baselinePenalty - rightsPenalty;
}

function computeGeneralScore(t: TalentScoutTrack): number {
  const ugcGrowth =
    growthScore(t.tiktokVideos7dGrowth) * 0.3 +
    growthScore(t.tiktokViews7dGrowth) * 0.2;
  const streamsGrowth =
    growthScore(t.spotifyStreams7dGrowth ?? 0) * 0.3 +
    growthScore(t.luminateStreams7dGrowth ?? 0) * 0.2;
  return ugcGrowth + streamsGrowth;
}

function growthScore(delta: number): number {
  if (!delta || Number.isNaN(delta)) return 0;
  const capped = Math.max(-100, Math.min(300, delta));
  return capped / 100; // -1 to 3
}

function baselineSizePenalty(
  spotifyStreamsLatest: string | null,
  luminateStreamsLatest: string | null,
): number {
  const spotify = Number(spotifyStreamsLatest ?? 0);
  const luminate = Number(luminateStreamsLatest ?? 0);
  const combined = spotify + luminate;
  if (combined <= 0) return 0;
  const log = Math.log10(combined + 1);
  return Math.max(0, (log - 6) / 4); // penalize heavily above ~1M–10M
}

function buildActions(t: TalentScoutTrack, totalScore: number): TalentScoutAction[] {
  const actions: TalentScoutAction[] = [];

  if (growthScore(t.tiktokVideos7dGrowth) > 0.5) {
    actions.push({
      type: 'ugc_double_down',
      description:
        'UGC videos are surging; secure key creators and seed more content in lead markets.',
      expectedImpact: 'Sustain UGC velocity and widen creator base over next 7–14 days.',
    });
  }

  if (!t.spotifyStreamsLatest || Number(t.spotifyStreamsLatest) < 500_000) {
    actions.push({
      type: 'playlist_pitch',
      description:
        'Track is early on streaming; pitch to editorial and algorithmic playlists.',
      expectedImpact: 'Convert UGC demand into 20–30% higher daily streams.',
    });
  }

  if (t.luminateSpinsLatest && Number(t.luminateSpinsLatest) > 0) {
    actions.push({
      type: 'radio_watch',
      description: 'Monitor early radio adopters for potential targeted pushes.',
      expectedImpact: 'Increase audience where spins are starting without overcommitting spend.',
    });
  }

  if ((t.rightsComplexityScore ?? 0) > 0.5) {
    actions.push({
      type: 'rights_cleanup',
      description:
        'Rights and credits look complex; align ahead of campaign to avoid friction.',
      expectedImpact:
        'Faster licensing and fewer blocked opportunities with partners and platforms.',
    });
  }

  if (!actions.length && totalScore > 0) {
    actions.push({
      type: 'geo_focus',
      description: 'Focus early marketing on top UGC geos where momentum is strongest.',
      expectedImpact: 'Increase conversion from UGC to platform streams in those markets.',
    });
  }

  return actions;
}
}
