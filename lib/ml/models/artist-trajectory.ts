/**
 * Artist trajectory ML model — trains a multinomial logistic regression on
 * historical ArtistTrajectorySnapshot data and stores weights in ml_models.
 *
 * Classes: DECLINING | STABLE | GROWING | ABOUT_TO_BREAK
 */
import { db } from '@/lib/db';
import { trainLogistic, predictProba, predictClass, type TrainedModel } from '../regression';
import { extractArtistTrainingData, buildArtistFeatureVector, ARTIST_FEATURE_NAMES } from '../features/artist';
import { archiveAndPromote } from '../versioning';

export const MODEL_TYPE = 'artist-trajectory';
export const MODEL_VERSION = 1;
export const CLASSES = ['DECLINING', 'STABLE', 'GROWING', 'ABOUT_TO_BREAK'];
const MIN_SAMPLES_PER_CLASS = 10;

// In-memory cache — survives across requests in the same Vercel instance
let _cached: TrainedModel | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function loadModel(): Promise<TrainedModel | null> {
  const now = Date.now();
  if (_cached && now - _cacheTime < CACHE_TTL_MS) return _cached;

  const row = await db.mlModel.findUnique({ where: { modelType: MODEL_TYPE } });
  if (!row) return null;

  _cached = row.weights as unknown as TrainedModel;
  _cacheTime = now;
  return _cached;
}

export function invalidateModelCache() {
  _cached = null;
  _cacheTime = 0;
}

export type TrainResult = {
  accuracy: number;
  nSamples: number;
  classCounts: Record<string, number>;
  skipped: boolean;
  reason?: string;
  promoted?: boolean;
  incumbentAccuracy?: number;
};

// A retrain can dip slightly on held-out accuracy just from sampling noise —
// don't require strict improvement, but block a real regression from
// silently overwriting a better incumbent model.
const MAX_ACCURACY_REGRESSION = 0.02;

/** Train on all available ArtistTrajectorySnapshot data and save to DB. */
export async function trainArtistTrajectoryModel(): Promise<TrainResult> {
  const data = await extractArtistTrainingData();

  if (!data.length) {
    return { accuracy: 0, nSamples: 0, classCounts: {}, skipped: true, reason: 'no training data' };
  }

  // Class distribution check
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

  const model = trainLogistic(X, y, CLASSES, [...ARTIST_FEATURE_NAMES], {
    epochs: 800,
    lr: 0.008,
    batchSize: 64,
    l2: 1e-4,
  });

  // Promotion gate: don't let a retrain silently overwrite a meaningfully
  // better incumbent. The daily cron ran unconditionally before this — a bad
  // ingest day could degrade live predictions with no automatic protection
  // and no visibility that it happened.
  const incumbent = await db.mlModel.findUnique({ where: { modelType: MODEL_TYPE } });
  const incumbentAccuracy = incumbent?.accuracy ?? null;
  const regressed =
    incumbentAccuracy != null && model.accuracy < incumbentAccuracy - MAX_ACCURACY_REGRESSION;

  if (regressed) {
    console.warn(
      `[ml:artist-trajectory] retrain REJECTED — held-out accuracy ${model.accuracy.toFixed(3)} ` +
        `regresses more than ${MAX_ACCURACY_REGRESSION} below incumbent ${incumbentAccuracy!.toFixed(3)}. ` +
        `Keeping the existing model in production.`,
    );
    return {
      accuracy: model.accuracy,
      nSamples: model.nSamples,
      classCounts,
      skipped: false,
      promoted: false,
      incumbentAccuracy: incumbentAccuracy!,
      reason: `held-out accuracy regressed vs incumbent (${model.accuracy.toFixed(3)} < ${incumbentAccuracy!.toFixed(3)} - ${MAX_ACCURACY_REGRESSION})`,
    };
  }

  // Archive as a new version AND set active — reversible in one step.
  const { version } = await archiveAndPromote(MODEL_TYPE, {
    weights: model,
    accuracy: model.accuracy,
    nSamples: model.nSamples,
    trainedAt: new Date(model.trainedAt),
  });

  invalidateModelCache();
  console.log(
    `[ml:artist-trajectory] trained + promoted as v${version} — samples=${model.nSamples} ` +
      `heldOutAccuracy=${model.accuracy.toFixed(3)} (train=${model.trainAccuracy.toFixed(3)}, ` +
      `heldOut=${model.heldOut}, nTest=${model.nTestSamples})`,
  );

  return {
    accuracy: model.accuracy,
    nSamples: model.nSamples,
    classCounts,
    skipped: false,
    promoted: true,
    ...(incumbentAccuracy != null ? { incumbentAccuracy } : {}),
  };
}

export type ArtistPrediction = {
  artistId: number;
  status: string;
  breakProbability: number;
  modelName: string;
  modelVersion: number;
  source: 'ml' | 'rules';
};

/**
 * Predict trajectory for a batch of artists.
 * Falls back to the rule-based classifyStatus result if no model is trained.
 */
export async function predictArtistBatch(
  items: Array<{
    artist_id: number;
    streams7dDelta: number;
    streams28dDelta: number;
    streams90dDelta: number;
    playlistsDelta28d: number;
    followersDelta28d: number;
    tiktokVelocityScore: number;
    airplayVelocityScore: number;
    maxTrackProbViral: number;
    spotifyBreakProb: number;
  }>,
): Promise<ArtistPrediction[]> {
  const model = await loadModel();

  return items.map((item) => {
    const features = buildArtistFeatureVector({
      streams7dDelta: item.streams7dDelta,
      streams28dDelta: item.streams28dDelta,
      streams90dDelta: item.streams90dDelta,
      playlistsDelta28d: item.playlistsDelta28d,
      followersDelta28d: item.followersDelta28d,
      tiktokVelocityScore: item.tiktokVelocityScore,
      airplayVelocityScore: item.airplayVelocityScore,
      maxTrackProbViral: item.maxTrackProbViral,
      spotifyBreakProb: item.spotifyBreakProb,
    });

    if (!model) {
      // Rule-based fallback (same as ETL classifyStatus)
      const { status, breakProbability } = ruleBasedFallback(item);
      return { artistId: item.artist_id, status, breakProbability, modelName: 'rules-v1', modelVersion: 0, source: 'rules' };
    }

    const probs = predictProba(features, model);
    const status = predictClass(features, model);
    const breakIdx = CLASSES.indexOf('ABOUT_TO_BREAK');
    const breakProbability = probs[breakIdx] ?? 0;

    return {
      artistId: item.artist_id,
      status,
      breakProbability,
      modelName: MODEL_TYPE,
      modelVersion: MODEL_VERSION,
      source: 'ml',
    };
  });
}

function ruleBasedFallback(item: {
  streams28dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
  tiktokVelocityScore: number;
  airplayVelocityScore: number;
}): { status: string; breakProbability: number } {
  const viralBoost = item.tiktokVelocityScore * 0.3 + item.airplayVelocityScore * 0.2;
  const momentum = item.streams28dDelta + viralBoost;

  if (momentum > 1.0 && item.playlistsDelta28d > 0.5 && item.followersDelta28d > 0.2) {
    return { status: 'ABOUT_TO_BREAK', breakProbability: Math.min(1, 0.8 + viralBoost * 0.1) };
  }
  if (momentum > 0.2) {
    return { status: 'GROWING', breakProbability: 0.4 + Math.min(momentum, 1.0) * 0.3 };
  }
  if (item.streams28dDelta < -0.2 && item.playlistsDelta28d < -0.1) {
    return { status: 'DECLINING', breakProbability: 0.1 };
  }
  return { status: 'STABLE', breakProbability: 0.2 };
}
