import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth/middleware";
import type { PredictionResponse } from "@/lib/ingestion/types";
import { logger } from "@/lib/monitoring/logger";
import { rankSignals } from "@/lib/trajectory/signal-ranker";

export const GET = withAuth("trajectory:read", async (req, ctx) => {
  const artistId = parseInt(ctx.params.artistId);
  if (isNaN(artistId)) return NextResponse.json({ error: "Invalid artist ID" }, { status: 400 });

  // 1. Get latest prediction from DB (PredictionOutcome or TrajectoryPrediction)
  const cached = await prisma.trajectoryPrediction.findUnique({
    where: { entityType_entityId: { entityType: "artist", entityId: artistId } },
  });

  // 2. If fresh (< 1h old): return cached
  const ONE_HOUR = 60 * 60 * 1000;
  if (cached && Date.now() - cached.computedAt.getTime() < ONE_HOUR) {
    return NextResponse.json(formatPredictionResponse(cached, false));
  }

  // 3. Get latest signals for this artist
  const signals = await prisma.predictionSignal.findMany({
    where: { entityType: "artist", entityId: artistId },
    orderBy: { recordedAt: "desc" },
    take: 50,
  });

  // 4. If no signals and no cache: return 404 with helpful message
  if (signals.length === 0 && !cached) {
    return NextResponse.json(
      { error: "No data available for this artist. Ingest signals first." },
      { status: 404 }
    );
  }

  // 5. If no fresh signals but have cache: return stale cache + warning
  if (signals.length === 0 && cached) {
    return NextResponse.json(formatPredictionResponse(cached, true, "No recent signals; using cached prediction"));
  }

  // 6. Compute fresh prediction using trajectory engine (existing lib/trajectory)
  const { predictTrajectory } = await import("@/lib/trajectory/model");
  const prediction = await predictTrajectory("artist", artistId);

  // 7. Use LambdaMART-style signal ranker for top signals
  const featureVector: Record<string, number> = {};
  for (const sig of signals) {
    if (!featureVector[sig.signalType]) {
      featureVector[sig.signalType] = sig.value;
    }
  }
  const ranking = rankSignals(artistId, signals, featureVector);

  // Build response with ranked signals and quality warnings
  return NextResponse.json({
    artistId,
    breakoutProbability: Math.round(prediction.breakoutProb * 100),
    confidenceScore: prediction.confidence,
    modelVersion: prediction.modelVersion,
    topSignals: ranking.topSignals as unknown as PredictionResponse["topSignals"],
    explanationText: ranking.explanationText,
    dataQualityWarnings: ranking.dataQualityWarnings,
    predictedAt: new Date().toISOString(),
    warning: ranking.dataQualityWarnings.length > 0
      ? ranking.dataQualityWarnings[0]
      : undefined,
  } satisfies PredictionResponse & { predictedAt: string; explanationText: string; dataQualityWarnings: string[] });
});

function formatPredictionResponse(pred: any, stale: boolean, warning?: string): PredictionResponse {
  return {
    artistId: pred.entityId,
    breakoutProbability: Math.round(pred.breakoutProb * 100),
    confidenceScore: pred.confidence,
    modelVersion: pred.modelVersion,
    topSignals: [],
    predictedAt: pred.computedAt.toISOString(),
    warning: stale ? (warning ?? "Using cached prediction") : undefined,
  };
}

