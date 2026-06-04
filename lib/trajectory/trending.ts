// Batch trending computation
import { db } from '@/lib/db';
import { ApiError } from '@/lib/shared/errors';
import { TrajectorySignal, TrendingEntry } from './types';
import { predictTrajectory } from './model';

export const TRENDING_CACHE_KEY = 'trending_v1';

/**
 * Build a daily aggregated sparkline of viralityScore proxy (signal value averages)
 * for the last N days.
 */
export function buildSparkline(signals: TrajectorySignal[], days: number = 7): number[] {
  const result: number[] = new Array(days).fill(0);
  const now = Date.now();

  for (const signal of signals) {
    const daysAgo = Math.floor(
      (now - signal.recordedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysAgo >= 0 && daysAgo < days) {
      const idx = days - 1 - daysAgo;
      result[idx] = Math.max(result[idx], Math.max(0, Math.min(1, signal.value)));
    }
  }

  return result;
}

/**
 * Fetches top-N entities by recent signal volume, computes trajectories,
 * sorts by viralityScore, computes deltaRank vs previous order, returns TrendingEntry[].
 */
export async function getTrending(
  entityType: 'track' | 'artist',
  limit: number = 50,
): Promise<TrendingEntry[]> {
  // Find top entities by signal count in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let topEntities: Array<{ entityId: number; _count: { entityId: number } }>;
  try {
    topEntities = await db.predictionSignal.groupBy({
      by: ['entityId'],
      where: {
        entityType,
        recordedAt: { gte: sevenDaysAgo },
      },
      _count: { entityId: true },
      orderBy: { _count: { entityId: 'desc' } },
      take: limit * 2, // fetch extra to account for filtering
    });
  } catch (err) {
    throw new ApiError('Failed to fetch trending entities', 500, 'INTERNAL_ERROR');
  }

  // Compute predictions for each entity
  const predictions = await Promise.allSettled(
    topEntities.map((e) => predictTrajectory(entityType, e.entityId)),
  );

  const successfulPredictions = predictions
    .filter(
      (p): p is PromiseFulfilledResult<Awaited<ReturnType<typeof predictTrajectory>>> =>
        p.status === 'fulfilled',
    )
    .map((p) => p.value);

  // Sort by viralityScore descending
  successfulPredictions.sort(
    (a, b) => b.score.viralityScore - a.score.viralityScore,
  );

  const topN = successfulPredictions.slice(0, limit);

  // Fetch yesterday's ranking from DB for deltaRank calculation
  const yesterdayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let yesterdayRows: Array<{ entityId: number; viralityScore: number }>;
  try {
    yesterdayRows = await db.trajectoryPrediction.findMany({
      where: {
        entityType,
        computedAt: { lt: yesterdayCutoff },
      },
      select: { entityId: true, viralityScore: true },
      orderBy: { viralityScore: 'desc' },
    });
  } catch {
    yesterdayRows = [];
  }

  // Build yesterday rank map (entityId -> rank, 1-indexed)
  const yesterdayRankMap = new Map<number, number>();
  yesterdayRows.forEach((row, idx) => {
    yesterdayRankMap.set(row.entityId, idx + 1);
  });

  // Build trending entries
  const entries: TrendingEntry[] = topN.map((prediction, idx) => {
    const currentRank = idx + 1;
    const yesterdayRank = yesterdayRankMap.get(prediction.entityId);
    const deltaRank = yesterdayRank !== undefined ? yesterdayRank - currentRank : 0;

    return {
      entityType: prediction.entityType,
      entityId: prediction.entityId,
      rank: currentRank,
      score: prediction.score,
      deltaRank,
      sparkline: buildSparkline(prediction.signals, 7),
    };
  });

  return entries;
}
