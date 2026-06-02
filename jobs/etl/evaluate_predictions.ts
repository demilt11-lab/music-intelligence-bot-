// jobs/etl/evaluate_predictions.ts
import "dotenv/config";
import { db } from "@/lib/db";

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
 * Precision = TP / (TP + FP)
 * Recall    = TP / (TP + FN)
 * F1        = 2 * precision * recall / (precision + recall)
 *
 * Here we treat "was_correct=true" as TP and "was_correct=false" as FP/FN
 * at the binary level (correct vs. incorrect).
 */
function computeMetrics(correct: number, total: number): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
} {
  if (total === 0) {
    return { accuracy: 0, precision: 0, recall: 0, f1Score: 0 };
  }
  const accuracy = correct / total;
  // Binary: precision = recall = accuracy (TP / (TP + FP) where FP = incorrect)
  const precision = accuracy;
  const recall = accuracy;
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
  }

  const { accuracy, precision, recall, f1Score } = computeMetrics(
    correct,
    pending.length,
  );

  console.log(
    `[evaluate_predictions] trend_label accuracy=${(accuracy * 100).toFixed(1)}% (${correct}/${pending.length})`,
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

    let wasCorrect = false;
    if (predictedProb > 0.7 && isPositive) {
      wasCorrect = true;
    } else if (predictedProb <= 0.7 && !isPositive) {
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
  }

  const { accuracy, precision, recall, f1Score } = computeMetrics(
    correct,
    pending.length,
  );

  console.log(
    `[evaluate_predictions] break_probability accuracy=${(accuracy * 100).toFixed(1)}% (${correct}/${pending.length})`,
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

  console.log(`[evaluate_predictions] Evaluation complete for ${dateStr}.`);
}

if (require.main === module) {
  const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  evaluatePredictions(dateArg)
    .then(() => {
      console.log(`[evaluate_predictions] Done for ${dateArg}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[evaluate_predictions] Fatal error:", err);
      process.exit(1);
    });
}
