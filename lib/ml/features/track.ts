/**
 * Extract track-viral feature vectors from platform stats + UGC metrics.
 *
 * Label source: TrackTrendLabel.label (VIRAL / TRENDING / POPULAR / NONE)
 * These labels are set by the rule-based ETL in jobs/etl/track_trend_labels.ts
 * and serve as the ground truth for training.
 */
import { db } from '@/lib/db';

export const TRACK_FEATURE_NAMES = [
  'streams7d',
  'streams7dDeltaPct',
  'tiktokCreations',
  'youtubeViews',
  'spotifyPopularity',
  'spotifyMonthlyListeners',
  'totalPlaylists',
  'ugcVideos7d',
  'ugcViews7d',
] as const;

export type TrackFeatureRow = {
  trackId: number;
  features: number[];
  label: string;  // VIRAL | TRENDING | POPULAR | NONE
};

/** Pull labelled training data for the track viral classifier. */
export async function extractTrackTrainingData(): Promise<TrackFeatureRow[]> {
  // One label per (trackId, genre, code2) — just take the max label per track
  const labels = await db.trackTrendLabel.findMany({
    select: { trackId: true, label: true },
    orderBy: { updatedAt: 'desc' },
    distinct: ['trackId'],
  });

  if (!labels.length) return [];

  const trackIds = labels.map((l) => l.trackId);

  const [stats, ugcMap] = await Promise.all([
    db.trackStatisticsLatest.findMany({
      where: { trackId: { in: trackIds } },
      select: {
        trackId: true,
        spotifyMonthlyListeners: true,
        spotifyPopularity: true,
        tiktokCreations: true,
        youtubeViews: true,
        totalPlaylists: true,
      },
    }),
    db.ugcTrackMetrics.findMany({
      where: { trackId: { in: trackIds } },
      orderBy: { date: 'desc' },
      distinct: ['trackId'],
      select: {
        trackId: true,
        videos7d: true,
        views7d: true,
        views7dGrowth: true,
      },
    }).then((rows) => new Map(rows.map((r) => [r.trackId, r]))),
  ]);

  const statsMap = new Map(stats.map((s) => [s.trackId, s]));
  const labelMap = new Map(labels.map((l) => [l.trackId, l.label]));

  const rows: TrackFeatureRow[] = [];
  for (const [trackId, label] of labelMap) {
    const s = statsMap.get(trackId);
    const u = ugcMap.get(trackId);
    rows.push({
      trackId,
      features: buildTrackFeatureVector(s ?? null, u ?? null),
      label,
    });
  }
  return rows;
}

type StatSnap = {
  spotifyMonthlyListeners: bigint | null;
  spotifyPopularity: number | null;
  tiktokCreations: bigint | null;
  youtubeViews: bigint | null;
  totalPlaylists: number | null;
};

type UgcSnap = {
  videos7d: number;
  views7d: bigint;
  views7dGrowth: number;
};

export function buildTrackFeatureVector(
  stats: StatSnap | null,
  ugc: UgcSnap | null,
): number[] {
  return [
    0,                                                         // streams7d placeholder (not in latest stats table)
    0,                                                         // streams7dDeltaPct placeholder
    safeNum(stats?.tiktokCreations),
    safeNum(stats?.youtubeViews),
    stats?.spotifyPopularity ?? 0,
    safeNum(stats?.spotifyMonthlyListeners),
    stats?.totalPlaylists ?? 0,
    ugc?.videos7d ?? 0,
    safeNum(ugc?.views7d),
  ];
}

function safeNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'bigint' ? Number(v) : v;
  return isFinite(n) ? n : 0;
}
