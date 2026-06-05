/**
 * GET /api/v1/monitor
 *
 * Returns the full continuous-learning health dashboard:
 *   - model version history + active version metrics
 *   - prediction outcome accuracy (rolling 7d / 30d / 90d)
 *   - drift events (latest 10)
 *   - retraining run history (latest 5)
 *   - human review queue stats
 *   - key metric trends (precision@10, recall, AUROC)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Rolling window accuracy helper — computes precision/recall from PredictionOutcome rows
function computeWindowMetrics(rows: Array<{
  breakoutProb: number;
  actualBrokeOut: boolean | null;
  wasCorrect: boolean | null;
}>) {
  const evaluated = rows.filter((r) => r.actualBrokeOut !== null);
  if (evaluated.length === 0) return null;

  const threshold = 0.5;
  let tp = 0, fp = 0, fn = 0, tn = 0, correct = 0;
  for (const r of evaluated) {
    const predicted = r.breakoutProb >= threshold;
    const actual = r.actualBrokeOut as boolean;
    if (predicted && actual)  { tp++; correct++; }
    if (predicted && !actual) { fp++; }
    if (!predicted && actual) { fn++; }
    if (!predicted && !actual){ tn++; correct++; }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  // Precision@10: top-10 by predicted prob, how many actually broke out
  const top10 = [...evaluated]
    .sort((a, b) => b.breakoutProb - a.breakoutProb)
    .slice(0, 10);
  const precisionAt10 = top10.length > 0
    ? top10.filter((r) => r.actualBrokeOut).length / top10.length
    : null;

  return {
    n: evaluated.length,
    accuracy: correct / evaluated.length,
    precision,
    recall,
    f1,
    precisionAt10,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
  };
}

export async function GET(req: NextRequest) {
  const now = new Date();
  const day7  = new Date(now); day7.setDate(now.getDate() - 7);
  const day30 = new Date(now); day30.setDate(now.getDate() - 30);
  const day90 = new Date(now); day90.setDate(now.getDate() - 90);

  const [
    activeModel,
    modelHistory,
    outcomes7d,
    outcomes30d,
    outcomes90d,
    recentDriftEvents,
    retrainingRuns,
    pendingReview,
    completedReview7d,
    totalPredictions,
    pendingEval,
  ] = await Promise.all([
    // Active model version
    db.modelVersion.findFirst({
      where: { isActive: true },
      select: {
        id: true, version: true, modelType: true, metrics: true,
        trainedAt: true, promotedAt: true, trainSamples: true, notes: true,
      },
    }),

    // Last 5 model versions for history
    db.modelVersion.findMany({
      orderBy: { trainedAt: "desc" },
      take: 5,
      select: {
        id: true, version: true, modelType: true, metrics: true,
        isActive: true, isBaseline: true, trainedAt: true, trainSamples: true,
      },
    }),

    // Outcomes in rolling windows
    db.predictionOutcome.findMany({
      where: { evaluated: true, evaluatedAt: { gte: day7 } },
      select: { breakoutProb: true, actualBrokeOut: true, wasCorrect: true },
    }),
    db.predictionOutcome.findMany({
      where: { evaluated: true, evaluatedAt: { gte: day30 } },
      select: { breakoutProb: true, actualBrokeOut: true, wasCorrect: true },
    }),
    db.predictionOutcome.findMany({
      where: { evaluated: true, evaluatedAt: { gte: day90 } },
      select: { breakoutProb: true, actualBrokeOut: true, wasCorrect: true },
    }),

    // Drift events
    db.driftEvent.findMany({
      orderBy: { detectedAt: "desc" },
      take: 10,
      select: {
        id: true, detectedAt: true, driftType: true, severity: true,
        affectedFeature: true, psiScore: true, currentValue: true,
        referenceValue: true, delta: true, summary: true, resolvedAt: true,
        triggeredRetrain: true,
      },
    }),

    // Retraining run history
    db.retrainingRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true, triggeredBy: true, status: true, prevAuroc: true,
        newAuroc: true, accuracyDelta: true, rolledBack: true,
        rollbackReason: true, newLabeledCases: true,
        startedAt: true, completedAt: true, notes: true,
      },
    }),

    // Human review queue stats
    db.humanReviewItem.count({ where: { status: "pending" } }),
    db.humanReviewDecision.count({
      where: { decidedAt: { gte: day7 } },
    }),

    // Total predictions (all time)
    db.predictionOutcome.count(),

    // Pending evaluation (>90 days old, not yet evaluated)
    db.predictionOutcome.count({
      where: { evaluated: false, predictedAt: { lt: day90 } },
    }),
  ]);

  // Accuracy metrics per window
  const accuracy = {
    "7d":  computeWindowMetrics(outcomes7d),
    "30d": computeWindowMetrics(outcomes30d),
    "90d": computeWindowMetrics(outcomes90d),
  };

  // Drift summary
  const unresolvedDrift = recentDriftEvents.filter((e) => !e.resolvedAt);
  const highSeverityDrift = unresolvedDrift.filter((e) =>
    e.severity === "retrain" || e.severity === "alert_team"
  );

  // Health status
  let healthStatus: "healthy" | "degraded" | "critical" = "healthy";
  const acc30d = accuracy["30d"];
  const acc90d = accuracy["90d"];
  if (highSeverityDrift.length > 0) {
    healthStatus = "critical";
  } else if (
    acc30d && acc90d &&
    acc90d.accuracy > 0 &&
    acc30d.accuracy < acc90d.accuracy - 0.05
  ) {
    healthStatus = "degraded";
  } else if (unresolvedDrift.length > 0) {
    healthStatus = "degraded";
  }

  // Weekly accuracy trend (last 8 weeks)
  const weeklyTrend: Array<{ weekStart: string; accuracy: number | null; n: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const weekEnd   = new Date(now); weekEnd.setDate(now.getDate() - i * 7);
    const weekStart = new Date(weekEnd); weekStart.setDate(weekEnd.getDate() - 7);
    const weekOutcomes = await db.predictionOutcome.findMany({
      where: {
        evaluated: true,
        evaluatedAt: { gte: weekStart, lt: weekEnd },
      },
      select: { wasCorrect: true },
    });
    const n = weekOutcomes.length;
    const correct = weekOutcomes.filter((r) => r.wasCorrect).length;
    weeklyTrend.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      accuracy: n > 0 ? correct / n : null,
      n,
    });
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    healthStatus,
    model: {
      active: activeModel,
      history: modelHistory,
    },
    accuracy,
    weeklyTrend,
    drift: {
      recentEvents: recentDriftEvents,
      unresolvedCount: unresolvedDrift.length,
      highSeverityCount: highSeverityDrift.length,
    },
    retraining: {
      runs: retrainingRuns,
      lastRunAt: retrainingRuns[0]?.startedAt ?? null,
      lastRunStatus: retrainingRuns[0]?.status ?? null,
    },
    humanReview: {
      pendingCount: pendingReview,
      completedLast7d: completedReview7d,
    },
    predictions: {
      total: totalPredictions,
      pendingEvaluation: pendingEval,
    },
  });
}
