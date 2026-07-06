// jobs/etl/evaluate_predictions.ts
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';

const WINDOW_DAYS = 30;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * Confusion matrix for a binary detector. Each evaluator decides, per row,
 * whether the model made a *positive* (actionable) call — e.g. "this will
 * break out", "this is trending", "high break probability" — and whether that
 * call was correct (the existing `wasCorrect` logic). From those two bits every
 * row lands in exactly one cell:
 *
 *   predictedPositive & correct   → TP   (flagged it, and was right)
 *   predictedPositive & !correct  → FP   (flagged it, and was wrong)
 *   !predictedPositive & correct  → TN   (said "no", and was right)
 *   !predictedPositive & !correct → FN   (said "no", but missed a real one)
 */
export type ConfusionMatrix = { tp: number; fp: number; fn: number; tn: number };

export function emptyConfusion(): ConfusionMatrix {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

/** Fold one evaluated prediction into the running confusion matrix. */
export function tally(
  cm: ConfusionMatrix,
  predictedPositive: boolean,
  wasCorrect: boolean,
): void {
  if (predictedPositive && wasCorrect) cm.tp++;
  else if (predictedPositive && !wasCorrect) cm.fp++;
  else if (!predictedPositive && wasCorrect) cm.tn++;
  else cm.fn++;
}

/**
 * Precision = TP / (TP + FP)   — of everything we flagged, how much was real
 * Recall    = TP / (TP + FN)   — of everything real, how much we caught
 * Accuracy  = (TP + TN) / N    — overall correctness (== correct/total)
 * F1        = 2·P·R / (P + R)
 *
 * These are genuinely distinct: a model that flags almost nothing can have
 * high precision but poor recall, and vice-versa. Reporting one number for all
 * three (the old behaviour) hid exactly that trade-off from label data teams.
 */
export function computeMetrics(cm: ConfusionMatrix): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
} {
  const total = cm.tp + cm.fp + cm.fn + cm.tn;
  if (total === 0) {
    return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
  }
  const accuracy = (cm.tp + cm.tn) / total;
  const precision = cm.tp + cm.fp > 0 ? cm.tp / (cm.tp + cm.fp) : 0;
  const recall = cm.tp + cm.fn > 0 ? cm.tp / (cm.tp + cm.fn) : 0;
  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  return { accuracy, precision, recall, f1Score };
}

// ─────────────────────────────────────────────
// Evaluate trend_label predictions
// ─────────────────────────────────────────────

async function evaluateTrendLabels(today: Date): Promise<void> {
  const windowStart = subDays(today, 35);
  const windowEnd = subDays(today, 28);

  const pending = await db.predictionOutcome.findMany({
    where: {
      predictionType: "trend_label",
      predictedAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      wasCorrect: null,
      trackId: { not: null },
    },
  });

  console.log(
    `[evaluate_predictions] Evaluating ${pending.length} trend_label outcome(s) from ${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)}.`,
  );

  if (pending.length === 0) return;

  let correct = 0;
  const cm = emptyConfusion();

  for (const outcome of pending) {
    // Fetch the track's current trend label(s)
    const currentLabels = await db.trackTrendLabel.findMany({
      where: { trackId: outcome.trackId as number },
      select: { label: true },
    });

    const labelSet = new Set(currentLabels.map((l) => l.label));
    const predicted = outcome.predictedValue;
    let wasCorrect = false;

    if (predicted === "VIRAL" && (labelSet.has("VIRAL") || labelSet.has("TRENDING"))) {
      wasCorrect = true;
    } else if (predicted === "TRENDING" && (labelSet.has("TRENDING") || labelSet.has("POPULAR"))) {
      wasCorrect = true;
    } else if (predicted === "NONE" && labelSet.has("NONE")) {
      wasCorrect = true;
    }

    const actualValue =
      currentLabels.length > 0
        ? [...labelSet].sort().join(",")
        : "NONE";

    await db.predictionOutcome.update({
      where: { id: outcome.id },
      data: {
        actualValue,
        wasCorrect,
        evaluatedAt: today,
      },
    });

    if (wasCorrect) correct++;
    // Positive class = the model called a trend (anything but NONE).
    tally(cm, predicted !== "NONE", wasCorrect);
  }

  const { accuracy, precision, recall, f1Score } = computeMetrics(cm);

  console.log(
    `[evaluate_predictions] trend_label accuracy=${(accuracy * 100).toFixed(1)}% precision=${(precision * 100).toFixed(1)}% recall=${(recall * 100).toFixed(1)}% (${correct}/${pending.length})`,
  );

  await db.modelAccuracyReport.upsert({
    where: {
      modelName_evaluationDate_windowDays: {
        modelName: "compute_track_signals",
        evaluationDate: today,
        windowDays: WINDOW_DAYS,
      },
    },
    update: {
      totalPredictions: pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `trend_label evaluation against window ${windowStart.toISOString().slice(0, 10)}–${windowEnd.toISOString().slice(0, 10)}`,
    },
    create: {
      modelName: "compute_track_signals",
      evaluationDate: today,
      windowDays: WINDOW_DAYS,
      totalPredictions: pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `trend_label evaluation against window ${windowStart.toISOString().slice(0, 10)}–${windowEnd.toISOString().slice(0, 10)}`,
    },
  });
}

// ─────────────────────────────────────────────
// Evaluate ml_trend_label predictions — the *trained model's own output*
// (TrackTrendPrediction), scored against the same real-world outcome
// (current TrackTrendLabel) as evaluateTrendLabels() uses for the
// heuristic. Without this, ModelAccuracyReport only ever had rows for
// modelName="compute_track_signals"/"compute_artist_signals" (the
// rule-based ETL) — the actual ML model's accuracy was never measured.
// ─────────────────────────────────────────────

async function evaluateMlTrendLabels(today: Date): Promise<void> {
  const windowStart = subDays(today, 35);
  const windowEnd = subDays(today, 28);

  const pending = await db.predictionOutcome.findMany({
    where: {
      predictionType: "ml_trend_label",
      predictedAt: { gte: windowStart, lte: windowEnd },
      wasCorrect: null,
      trackId: { not: null },
    },
  });

  console.log(
    `[evaluate_predictions] Evaluating ${pending.length} ml_trend_label outcome(s) from ${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)}.`,
  );

  if (pending.length === 0) return;

  let correct = 0;
  // All rows in a given evaluation run come from the same trained model
  // (track-viral) — group by (modelName, modelVersion) in case that ever
  // changes, so accuracy isn't blended across model versions.
  const byModel = new Map<string, ConfusionMatrix>();

  for (const outcome of pending) {
    const currentLabels = await db.trackTrendLabel.findMany({
      where: { trackId: outcome.trackId as number },
      select: { label: true },
    });

    const labelSet = new Set(currentLabels.map((l) => l.label));
    const predicted = outcome.predictedValue;
    let wasCorrect = false;

    if (predicted === "VIRAL" && (labelSet.has("VIRAL") || labelSet.has("TRENDING"))) {
      wasCorrect = true;
    } else if (predicted === "TRENDING" && (labelSet.has("TRENDING") || labelSet.has("POPULAR"))) {
      wasCorrect = true;
    } else if (predicted === "NONE" && labelSet.has("NONE")) {
      wasCorrect = true;
    } else if (predicted === "POPULAR" && labelSet.has("POPULAR")) {
      wasCorrect = true;
    }

    const actualValue = currentLabels.length > 0 ? [...labelSet].sort().join(",") : "NONE";

    await db.predictionOutcome.update({
      where: { id: outcome.id },
      data: { actualValue, wasCorrect, evaluatedAt: today },
    });

    if (wasCorrect) correct++;
    const modelKey = `${outcome.modelName}:${outcome.modelVersion ?? "unversioned"}`;
    const agg = byModel.get(modelKey) ?? emptyConfusion();
    tally(agg, predicted !== "NONE", wasCorrect);
    byModel.set(modelKey, agg);
  }

  console.log(
    `[evaluate_predictions] ml_trend_label accuracy=${((correct / pending.length) * 100).toFixed(1)}% (${correct}/${pending.length})`,
  );

  for (const [modelKey, agg] of byModel) {
    const [modelName, modelVersionRaw] = modelKey.split(":");
    const modelVersion = modelVersionRaw === "unversioned" ? null : modelVersionRaw;
    const { accuracy, precision, recall, f1Score } = computeMetrics(agg);
    const aggTotal = agg.tp + agg.fp + agg.fn + agg.tn;
    const aggCorrect = agg.tp + agg.tn;

    await db.modelAccuracyReport.upsert({
      where: {
        modelName_evaluationDate_windowDays: {
          modelName,
          evaluationDate: today,
          windowDays: WINDOW_DAYS,
        },
      },
      update: {
        totalPredictions: aggTotal,
        correctPredictions: aggCorrect,
        accuracy,
        precision,
        recall,
        f1Score,
        notes: `ml_trend_label evaluation (trained model, version=${modelVersion ?? "n/a"}) against window ${windowStart.toISOString().slice(0, 10)}–${windowEnd.toISOString().slice(0, 10)}`,
      },
      create: {
        modelName,
        evaluationDate: today,
        windowDays: WINDOW_DAYS,
        totalPredictions: aggTotal,
        correctPredictions: aggCorrect,
        accuracy,
        precision,
        recall,
        f1Score,
        notes: `ml_trend_label evaluation (trained model, version=${modelVersion ?? "n/a"}) against window ${windowStart.toISOString().slice(0, 10)}–${windowEnd.toISOString().slice(0, 10)}`,
      },
    });
  }
}

// ─────────────────────────────────────────────
// Evaluate viral_score predictions (60-day retrospective)
// ─────────────────────────────────────────────
//
// For each viral_score prediction made ~60 days ago, we check whether the
// track's 7d Spotify streams actually grew >250% (3.5× baseline) in the
// following 60 days. A predicted score >0.7 is treated as a "breakout"
// call; a score ≤0.7 is "no breakout." Correctness = prediction and
// outcome agree.

const VIRAL_EVAL_WINDOW_DAYS = 60;
const BREAKOUT_GROWTH_FACTOR = 3.5; // 250% growth = 3.5× baseline
const VIRAL_SCORE_THRESHOLD = 0.7;

async function evaluateViralScores(today: Date): Promise<void> {
  const evalStart = subDays(today, VIRAL_EVAL_WINDOW_DAYS + 7);
  const evalEnd   = subDays(today, VIRAL_EVAL_WINDOW_DAYS - 7);

  const pending = await db.predictionOutcome.findMany({
    where: {
      predictionType: "viral_score",
      predictedAt:   { gte: evalStart, lte: evalEnd },
      wasCorrect:    null,
      trackId:       { not: null },
    },
  });

  console.log(
    `[evaluate_predictions] Evaluating ${pending.length} viral_score outcome(s) from ${evalStart.toISOString().slice(0, 10)} → ${evalEnd.toISOString().slice(0, 10)}.`,
  );

  if (pending.length === 0) return;

  // Collect all (trackId, predictedAt) pairs and fetch streams in bulk
  // for two 7-day windows: the baseline (before prediction) and the
  // outcome window (ending 60 days after prediction).
  const trackIds = [...new Set(pending.map((p) => p.trackId as number))];

  // Baseline: 7 days immediately before the prediction window closes.
  // Outcome: from prediction window end to today (covers the full 60d window).
  const baselineStart = subDays(evalEnd, 7);
  const outcomeStart  = evalEnd;
  const outcomeEnd    = today;

  const streamRows = await db.$queryRawUnsafe<
    { track_id: number; period: string; streams: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      CASE
        WHEN date BETWEEN $1::date AND $2::date THEN 'baseline'
        WHEN date BETWEEN $3::date AND $4::date THEN 'outcome'
      END AS period,
      SUM(streams) AS streams
    FROM track_platform_stats_daily
    WHERE "trackId" = ANY($5::int[])
      AND platform = 'spotify'
      AND date BETWEEN $1::date AND $4::date
    GROUP BY "trackId", period
    `,
    baselineStart.toISOString().slice(0, 10),
    evalEnd.toISOString().slice(0, 10),
    outcomeStart.toISOString().slice(0, 10),
    outcomeEnd.toISOString().slice(0, 10),
    trackIds,
  );

  type StreamSums = { baseline: number; outcome: number };
  const streamsByTrack = new Map<number, StreamSums>();
  for (const r of streamRows) {
    if (!r.period) continue;
    const entry = streamsByTrack.get(r.track_id) ?? { baseline: 0, outcome: 0 };
    if (r.period === 'baseline') entry.baseline += Number(r.streams);
    if (r.period === 'outcome')  entry.outcome  += Number(r.streams);
    streamsByTrack.set(r.track_id, entry);
  }

  let correct = 0;
  const cm = emptyConfusion();

  for (const outcome of pending) {
    const tid = outcome.trackId as number;
    const predictedScore = parseFloat(outcome.predictedValue);
    const predictedBreakout = predictedScore > VIRAL_SCORE_THRESHOLD;

    const sums = streamsByTrack.get(tid);
    const baseline = sums?.baseline ?? 0;
    const outcomeStreams = sums?.outcome ?? 0;

    // Growth factor: outcome / baseline (clamped so 0-baseline → 0)
    const growthFactor = baseline > 0 ? outcomeStreams / baseline : 0;
    const actualBreakout = growthFactor >= BREAKOUT_GROWTH_FACTOR;

    const wasCorrect = predictedBreakout === actualBreakout;
    const actualValue = `${growthFactor.toFixed(2)}x_growth`;

    await db.predictionOutcome.update({
      where: { id: outcome.id },
      data:  { actualValue, wasCorrect, evaluatedAt: today },
    });

    if (wasCorrect) correct++;
    // Positive class = the model called a breakout (score above threshold).
    tally(cm, predictedBreakout, wasCorrect);
  }

  const { accuracy, precision, recall, f1Score } = computeMetrics(cm);

  console.log(
    `[evaluate_predictions] viral_score (60d breakout) accuracy=${(accuracy * 100).toFixed(1)}% precision=${(precision * 100).toFixed(1)}% recall=${(recall * 100).toFixed(1)}% (${correct}/${pending.length})`,
  );

  await db.modelAccuracyReport.upsert({
    where: {
      modelName_evaluationDate_windowDays: {
        modelName:      "compute_track_signals",
        evaluationDate: today,
        windowDays:     VIRAL_EVAL_WINDOW_DAYS,
      },
    },
    update: {
      totalPredictions:   pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `viral_score 60d breakout evaluation (threshold=${VIRAL_SCORE_THRESHOLD}, growth=${BREAKOUT_GROWTH_FACTOR}x)`,
    },
    create: {
      modelName:          "compute_track_signals",
      evaluationDate:     today,
      windowDays:         VIRAL_EVAL_WINDOW_DAYS,
      totalPredictions:   pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `viral_score 60d breakout evaluation (threshold=${VIRAL_SCORE_THRESHOLD}, growth=${BREAKOUT_GROWTH_FACTOR}x)`,
    },
  });
}

// ─────────────────────────────────────────────
// Evaluate break_probability predictions
// ─────────────────────────────────────────────

async function evaluateBreakProbability(today: Date): Promise<void> {
  const targetDate = subDays(today, WINDOW_DAYS);
  const windowStart = subDays(today, WINDOW_DAYS + 3);
  const windowEnd = subDays(today, WINDOW_DAYS - 3);

  const pending = await db.predictionOutcome.findMany({
    where: {
      predictionType: "break_probability",
      predictedAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      wasCorrect: null,
      artistId: { not: null },
    },
  });

  console.log(
    `[evaluate_predictions] Evaluating ${pending.length} break_probability outcome(s) from ~${targetDate.toISOString().slice(0, 10)}.`,
  );

  if (pending.length === 0) return;

  let correct = 0;
  const cm = emptyConfusion();

  for (const outcome of pending) {
    // Find the artist's most recent trajectory snapshot
    const latestSnapshot = await db.artistTrajectorySnapshot.findFirst({
      where: { artistId: outcome.artistId as number },
      orderBy: { date: "desc" },
      select: { status: true },
    });

    const currentStatus = latestSnapshot?.status ?? "STABLE";
    const predictedProb = parseFloat(outcome.predictedValue);
    const isPositive =
      currentStatus === "ABOUT_TO_BREAK" || currentStatus === "GROWING";
    const predictedPositive = predictedProb > 0.7;

    let wasCorrect = false;
    if (predictedPositive && isPositive) {
      wasCorrect = true;
    } else if (!predictedPositive && !isPositive) {
      wasCorrect = true;
    }

    await db.predictionOutcome.update({
      where: { id: outcome.id },
      data: {
        actualValue: currentStatus,
        wasCorrect,
        evaluatedAt: today,
      },
    });

    if (wasCorrect) correct++;
    // Positive class = the model called a likely break (prob above threshold).
    tally(cm, predictedPositive, wasCorrect);
  }

  const { accuracy, precision, recall, f1Score } = computeMetrics(cm);

  console.log(
    `[evaluate_predictions] break_probability accuracy=${(accuracy * 100).toFixed(1)}% precision=${(precision * 100).toFixed(1)}% recall=${(recall * 100).toFixed(1)}% (${correct}/${pending.length})`,
  );

  await db.modelAccuracyReport.upsert({
    where: {
      modelName_evaluationDate_windowDays: {
        modelName: "compute_artist_signals",
        evaluationDate: today,
        windowDays: WINDOW_DAYS,
      },
    },
    update: {
      totalPredictions: pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `break_probability evaluation against ~${targetDate.toISOString().slice(0, 10)} predictions`,
    },
    create: {
      modelName: "compute_artist_signals",
      evaluationDate: today,
      windowDays: WINDOW_DAYS,
      totalPredictions: pending.length,
      correctPredictions: correct,
      accuracy,
      precision,
      recall,
      f1Score,
      notes: `break_probability evaluation against ~${targetDate.toISOString().slice(0, 10)} predictions`,
    },
  });
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

export async function evaluatePredictions(dateStr: string): Promise<void> {
  const today = new Date(dateStr);
  today.setUTCHours(0, 0, 0, 0);

  await evaluateTrendLabels(today);
  await evaluateBreakProbability(today);
  await evaluateViralScores(today);
  await evaluateMlTrendLabels(today);

  console.log(`[evaluate_predictions] Evaluation complete for ${dateStr}.`);
}

if (require.main === module) {
  const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  runTrackedJob('etl:evaluate-predictions', () => evaluatePredictions(dateArg))
    .then(() => {
      console.log(`[evaluate_predictions] Done for ${dateArg}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[evaluate_predictions] Fatal error:", err);
      process.exit(1);
    });
}
