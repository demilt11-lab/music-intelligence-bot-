/**
 * Track viral/trend classifier — multinomial logistic regression over
 * platform stats + UGC metrics.
 *
 * Classes: NONE | POPULAR | TRENDING | VIRAL
 * Labels come from TrackTrendLabel (set by rule-based ETL).
 */
import { db } from '@/lib/db';
import { trainLogistic, predictProba, predictClass, type TrainedModel } from '../regression';
import { extractTrackTrainingData, buildTrackFeatureVector, TRACK_FEATURE_NAMES } from '../features/track';

export const MODEL_TYPE = 'track-viral';
export const MODEL_VERSION = 1;
export const CLASSES = ['NONE', 'POPULAR', 'TRENDING', 'VIRAL'];
const MIN_SAMPLES_PER_CLASS = 5;

let _cached: TrainedModel | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function loadModel(): Promise<TrainedModel | null> {
  const now = Date.now();
  if (_cached && now - _cacheTime < CACHE_TTL_MS) return _cached;

  const row = await db.mlModel.findUnique({ where: { modelType: MODEL_TYPE } });
  if (!row) return null;

  _cached = row.weights as unknown as TrainedModel;
  _cacheTime = now;
  return _cached;
}

function invalidateCache() {
  _cached = null;
  _cacheTime = 0;
}

export type TrainResult = {
  accuracy: number;
  nSamples: number;
  classCounts: Record<string, number>;
  skipped: boolean;
  reason?: string;
};

export async function trainTrackViralModel(): Promise<TrainResult> {
  const data = await extractTrackTrainingData();

  if (!data.length) {
    return { accuracy: 0, nSamples: 0, classCounts: {}, skipped: true, reason: 'no training data' };
  }

  const classCounts: Record<string, number> = {};
  for (const row of data) classCounts[row.label] = (classCounts[row.label] ?? 0) + 1;

  const underrepresented = CLASSES.filter((c) => (classCounts[c] ?? 0) < MIN_SAMPLES_PER_CLASS);
  if (underrepresented.length > 0) {
    return {
      accuracy: 0,
      nSamples: data.length,
      classCounts,
      skipped: true,
      reason: `insufficient samples for classes: ${underrepresented.join(', ')} (need ${MIN_SAMPLES_PER_CLASS} each)`,
    };
  }

  const X = data.map((r) => r.features);
  const y = data.map((r) => CLASSES.indexOf(r.label));

  const model = trainLogistic(X, y, CLASSES, [...TRACK_FEATURE_NAMES], {
    epochs: 600,
    lr: 0.01,
    batchSize: 128,
    l2: 1e-4,
  });

  await db.mlModel.upsert({
    where: { modelType: MODEL_TYPE },
    update: {
      version: MODEL_VERSION,
      weights: model as any,
      accuracy: model.accuracy,
      nSamples: model.nSamples,
      trainedAt: new Date(model.trainedAt),
    },
    create: {
      modelType: MODEL_TYPE,
      version: MODEL_VERSION,
      weights: model as any,
      accuracy: model.accuracy,
      nSamples: model.nSamples,
      trainedAt: new Date(model.trainedAt),
    },
  });

  invalidateCache();
  console.log(`[ml:track-viral] trained — samples=${model.nSamples} accuracy=${model.accuracy.toFixed(3)}`);

  return { accuracy: model.accuracy, nSamples: model.nSamples, classCounts, skipped: false };
}

export const MODEL_NAME = MODEL_TYPE;

export type TrackPrediction = {
  trackId: number;
  label: string;
  probViral: number;
  probTrending: number;
  probPopular: number;
  probNone: number;
  modelName: string;
  modelVersion: number;
};

/**
 * Predict viral class + probabilities for a batch of tracks.
 * Returns null per-track if model is not available.
 */
export async function predictTrackBatch(
  trackIds: number[],
): Promise<TrackPrediction[]> {
  const model = await loadModel();
  if (!model || !trackIds.length) return [];

  const [statsRows, ugcRows] = await Promise.all([
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
      select: { trackId: true, videos7d: true, views7d: true, views7dGrowth: true },
    }),
  ]);

  const statsMap = new Map(statsRows.map((s) => [s.trackId, s]));
  const ugcMap = new Map(ugcRows.map((u) => [u.trackId, u]));

  return trackIds.map((trackId) => {
    const features = buildTrackFeatureVector(
      statsMap.get(trackId) ?? null,
      ugcMap.get(trackId) ?? null,
    );
    const probs = predictProba(features, model);
    const label = predictClass(features, model);

    return {
      trackId,
      label,
      probViral: probs[CLASSES.indexOf('VIRAL')] ?? 0,
      probTrending: probs[CLASSES.indexOf('TRENDING')] ?? 0,
      probPopular: probs[CLASSES.indexOf('POPULAR')] ?? 0,
      probNone: probs[CLASSES.indexOf('NONE')] ?? 0,
      modelName: MODEL_TYPE,
      modelVersion: MODEL_VERSION,
    };
  });
}

/**
 * Write ML predictions to TrackTrendPrediction for all tracks that have
 * at least one TrackTrendLabel. Called by the ml-retrain cron after training.
 */
export async function writeAllTrackPredictions(): Promise<{ written: number; skipped: number }> {
  const model = await loadModel();
  if (!model) return { written: 0, skipped: 1 };

  // Get all unique track IDs that have been labelled
  const labeled = await db.trackTrendLabel.findMany({
    select: { trackId: true },
    distinct: ['trackId'],
  });
  if (!labeled.length) return { written: 0, skipped: 0 };

  const trackIds = labeled.map((l) => l.trackId);
  const predictions = await predictTrackBatch(trackIds);

  const modelVersion = String(MODEL_VERSION);
  let written = 0;

  // Upsert in batches of 100 to avoid overwhelming the DB connection
  for (let i = 0; i < predictions.length; i += 100) {
    const batch = predictions.slice(i, i + 100);
    await Promise.all(
      batch.map(async (p) => {
        // Prisma can't use null in compound unique keys — use findFirst + create/update
        const existing = await db.trackTrendPrediction.findFirst({
          where: { trackId: p.trackId, genre: null, code2: null, modelName: p.modelName, modelVersion },
          select: { id: true },
        });
        if (existing) {
          await db.trackTrendPrediction.update({
            where: { id: existing.id },
            data: { label: p.label, probViral: p.probViral, probTrending: p.probTrending, probPopular: p.probPopular, probNone: p.probNone },
          });
        } else {
          await db.trackTrendPrediction.create({
            data: { trackId: p.trackId, genre: null, code2: null, label: p.label, probViral: p.probViral, probTrending: p.probTrending, probPopular: p.probPopular, probNone: p.probNone, modelName: p.modelName, modelVersion },
          }).catch(() => null);
        }
      }),
    );
    written += batch.length;
  }

  return { written, skipped: 0 };
}
