// Prediction orchestration with DB caching
import { db } from '@/lib/db';
import { ApiError } from '@/lib/shared/errors';
import { TrajectoryPrediction, TrajectorySignal } from './types';
import { computeFeatureVector } from './features';
import { computeTrajectoryScore } from './scoring';

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MODEL_VERSION = '1.0.0-rules';

function dbRowToSignal(row: {
  entityType: string;
  entityId: number;
  signalType: string;
  value: number;
  recordedAt: Date;
  source: string | null;
}): TrajectorySignal {
  return {
    entityType: row.entityType as 'track' | 'artist',
    entityId: row.entityId,
    signalType: row.signalType as TrajectorySignal['signalType'],
    value: row.value,
    recordedAt: row.recordedAt,
    source: row.source ?? undefined,
  };
}

function dbRowToPrediction(
  row: {
    entityType: string;
    entityId: number;
    momentum: number;
    breakoutProb: number;
    viralityScore: number;
    estimatedDaysToViral: number;
    peakScoreEstimate: number;
    confidence: number;
    modelVersion: string;
    computedAt: Date;
  },
  signals: TrajectorySignal[],
): TrajectoryPrediction {
  return {
    entityType: row.entityType as 'track' | 'artist',
    entityId: row.entityId,
    score: {
      momentum: row.momentum,
      breakoutProb: row.breakoutProb,
      viralityScore: row.viralityScore,
      estimatedDaysToViral: row.estimatedDaysToViral,
      peakScoreEstimate: row.peakScoreEstimate,
      confidence: row.confidence,
    },
    signals,
    computedAt: row.computedAt,
    modelVersion: row.modelVersion,
  };
}

export async function getCachedPrediction(
  entityType: 'track' | 'artist',
  entityId: number,
): Promise<TrajectoryPrediction | null> {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const row = await db.trajectoryPrediction.findFirst({
      where: {
        entityType,
        entityId,
        computedAt: { gt: cutoff },
      },
    });
    if (!row) return null;

    // Also fetch signals for the cached prediction
    const signalRows = await db.predictionSignal.findMany({
      where: { entityType, entityId },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    });

    return dbRowToPrediction(row, signalRows.map(dbRowToSignal));
  } catch (err) {
    throw new ApiError('Failed to fetch cached prediction', 500, 'INTERNAL_ERROR');
  }
}

export async function invalidateCache(
  entityType: 'track' | 'artist',
  entityId: number,
): Promise<void> {
  try {
    await db.trajectoryPrediction.deleteMany({
      where: { entityType, entityId },
    });
  } catch {
    // best-effort invalidation
  }
}

export async function predictTrajectory(
  entityType: 'track' | 'artist',
  entityId: number,
): Promise<TrajectoryPrediction> {
  // 1. Check DB cache
  const cached = await getCachedPrediction(entityType, entityId);
  if (cached) return cached;

  // 3. Fetch recent signals (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let signalRows: Awaited<ReturnType<typeof db.predictionSignal.findMany>>;
  try {
    signalRows = await db.predictionSignal.findMany({
      where: {
        entityType,
        entityId,
        recordedAt: { gte: ninetyDaysAgo },
      },
      orderBy: { recordedAt: 'desc' },
    });
  } catch (err) {
    throw new ApiError('Failed to fetch signals', 500, 'INTERNAL_ERROR');
  }

  const signals = signalRows.map(dbRowToSignal);

  // 4. Compute feature vector
  const features = computeFeatureVector(signals);

  // 5. Compute trajectory score
  const score = computeTrajectoryScore(features, signals);

  const computedAt = new Date();

  // 6. Upsert to trajectory_predictions
  try {
    await db.trajectoryPrediction.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      update: {
        momentum: score.momentum,
        breakoutProb: score.breakoutProb,
        viralityScore: score.viralityScore,
        estimatedDaysToViral: score.estimatedDaysToViral,
        peakScoreEstimate: score.peakScoreEstimate,
        confidence: score.confidence,
        modelVersion: MODEL_VERSION,
        computedAt,
      },
      create: {
        entityType,
        entityId,
        momentum: score.momentum,
        breakoutProb: score.breakoutProb,
        viralityScore: score.viralityScore,
        estimatedDaysToViral: score.estimatedDaysToViral,
        peakScoreEstimate: score.peakScoreEstimate,
        confidence: score.confidence,
        modelVersion: MODEL_VERSION,
        computedAt,
      },
    });
  } catch (err) {
    throw new ApiError('Failed to cache prediction', 500, 'INTERNAL_ERROR');
  }

  // 7. Return prediction
  return {
    entityType,
    entityId,
    score,
    signals,
    computedAt,
    modelVersion: MODEL_VERSION,
  };
}
