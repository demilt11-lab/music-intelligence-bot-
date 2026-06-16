import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';

const LOOKBACK_DAYS = 30;
const Z_THRESHOLD_LOW = 2.0;
const Z_THRESHOLD_MED = 3.0;
const Z_THRESHOLD_HIGH = 4.0;

interface MetricPoint { trackId: number; value: number; date: Date }

export function zScore(value: number, mean: number, std: number): number {
  if (std < 0.001) return 0;
  return (value - mean) / std;
}

export function stats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

export function severity(z: number): 'low' | 'medium' | 'high' | null {
  const abs = Math.abs(z);
  if (abs >= Z_THRESHOLD_HIGH) return 'high';
  if (abs >= Z_THRESHOLD_MED) return 'medium';
  if (abs >= Z_THRESHOLD_LOW) return 'low';
  return null;
}

async function detectMetricAnomalies(
  metric: string,
  points: MetricPoint[],
  today: Date,
): Promise<void> {
  const trackIds = [...new Set(points.map((p) => p.trackId))];
  let detected = 0;

  for (const trackId of trackIds) {
    const history = points
      .filter((p) => p.trackId === trackId && p.date < today)
      .map((p) => p.value);

    const todayPoint = points.find(
      (p) =>
        p.trackId === trackId &&
        p.date.toDateString() === today.toDateString(),
    );
    if (!todayPoint || history.length < 7) continue;

    const { mean, std } = stats(history);
    const z = zScore(todayPoint.value, mean, std);
    const sev = severity(z);
    if (!sev) continue;

    // AnomalyLog has no natural unique key (a track can have multiple
    // anomalies for the same metric over time) — every detection is a new row.
    await db.anomalyLog.create({
      data: {
        trackId,
        metric,
        zScore: z,
        currentValue: todayPoint.value,
        baselineMean: mean,
        baselineStd: std,
        severity: sev,
        detectedAt: today,
      },
    });

    detected++;

    // Auto-watchlist high-severity spikes for all tenants
    if (sev === 'high' && z > 0) {
      const tenants = await db.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        await db.watchlistItem.upsert({
          where: {
            tenantId_entityType_entityId: {
              tenantId: tenant.id,
              entityType: 'track',
              entityId: trackId,
            },
          },
          update: {},
          create: {
            tenantId: tenant.id,
            entityType: 'track',
            entityId: trackId,
            notes: JSON.stringify({ autoAdded: true, reason: `anomaly:${metric}:z${z.toFixed(1)}` }),
          },
        });
      }
    }
  }

  if (detected > 0) console.log(`[anomaly] ${metric}: ${detected} anomalies detected`);
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - LOOKBACK_DAYS);

  console.log(`[anomaly] Running detection for ${today.toISOString().slice(0, 10)}`);

  // TikTok views velocity
  const ugcRows = await db.ugcTrackMetrics.findMany({
    where: { date: { gte: cutoff } },
    select: { trackId: true, views7d: true, date: true },
  });

  const ugcPoints: MetricPoint[] = ugcRows.map((r) => ({
    trackId: r.trackId,
    value: Number(r.views7d),
    date: r.date,
  }));
  await detectMetricAnomalies('tiktok_views7d', ugcPoints, today);

  // YouTube views
  const ytRows = await db.trackPlatformStatsDaily.findMany({
    where: { platform: 'youtube', date: { gte: cutoff } },
    select: { trackId: true, videoViews: true, date: true },
  }) as Array<{ trackId: number; videoViews: bigint | null; date: Date }>;

  const ytPoints: MetricPoint[] = ytRows
    .filter((r) => r.videoViews != null)
    .map((r) => ({ trackId: r.trackId, value: Number(r.videoViews!), date: r.date }));
  await detectMetricAnomalies('youtube_views', ytPoints, today);

  // Chart rank (lower = better, so we invert for spike detection)
  const chartRows = await db.chartRow.findMany({
    where: { snapshot: { snapshotDate: { gte: cutoff } } },
    select: { trackId: true, rank: true, snapshot: { select: { snapshotDate: true } } },
  }) as Array<{ trackId: number | null; rank: number; snapshot: { snapshotDate: Date } }>;

  const chartPoints: MetricPoint[] = chartRows
    .filter((r) => r.trackId != null)
    .map((r) => ({
      trackId: r.trackId!,
      value: 51 - r.rank, // invert: rank 1 → 50, rank 50 → 1
      date: r.snapshot.snapshotDate,
    }));
  await detectMetricAnomalies('chart_rank_inverted', chartPoints, today);

  // Viral score spikes
  const vsRows = await db.talentScoutScore.findMany({
    where: { date: { gte: cutoff }, code2: 'GLOBAL' },
    select: { trackId: true, viralScore: true, date: true },
  });

  await detectMetricAnomalies('viral_score', vsRows.map((r) => ({
    trackId: r.trackId, value: r.viralScore, date: r.date,
  })), today);

  console.log('[anomaly] Detection complete');
}

if (require.main === module) {
  runTrackedJob('etl:anomaly', main).catch((e) => { console.error(e); process.exit(1); });
}
