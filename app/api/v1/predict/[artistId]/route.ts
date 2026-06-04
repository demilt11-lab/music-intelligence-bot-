import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth/middleware";
import type { PredictionResponse } from "@/lib/ingestion/types";
import { logger } from "@/lib/monitoring/logger";

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

  // 7. Get top signals with weights
  const topSignals = getTopSignals(signals);

  return NextResponse.json({
    artistId,
    breakoutProbability: Math.round(prediction.breakoutProb * 100),
    confidenceScore: prediction.confidence,
    modelVersion: prediction.modelVersion,
    topSignals,
    predictedAt: new Date().toISOString(),
    warning: null,
  } satisfies PredictionResponse);
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

function getTopSignals(signals: any[]): any[] {
  const SIGNAL_WEIGHTS: Record<string, number> = {
    save_rate: 0.18, tiktok_growth: 0.28, stream_velocity: 0.22,
    follower_velocity: 0.09, chart_momentum: 0.15, playlist_add: 0.05, radio_spike: 0.03,
  };
  const INTERPRETATIONS: Record<string, (v: number) => string> = {
    save_rate:         v => `${v > 0.5 ? "High" : v > 0.25 ? "Normal" : "Low"} save rate (${(v*100).toFixed(0)}%)`,
    tiktok_growth:     v => `${v > 0.7 ? "Viral" : v > 0.4 ? "Growing" : "Low"} TikTok traction`,
    stream_velocity:   v => `${v > 0.6 ? "Strong" : v > 0.3 ? "Moderate" : "Weak"} streaming growth`,
    follower_velocity: v => `${v > 0.3 ? "Rapid" : v > 0.1 ? "Steady" : "Slow"} follower growth`,
    chart_momentum:    v => v > 0.6 ? "Charting strongly" : v > 0.3 ? "Charting" : "Not charting",
    playlist_add:      v => `${v > 0.6 ? "Heavy" : "Moderate"} playlist activity`,
    radio_spike:       v => `${v > 0.5 ? "Significant" : "Moderate"} radio airplay`,
  };
  const latest = new Map<string, number>();
  for (const s of signals) {
    if (!latest.has(s.signalType)) latest.set(s.signalType, s.value);
  }
  return Array.from(latest.entries())
    .filter(([k]) => k in SIGNAL_WEIGHTS)
    .map(([signal, value]) => ({
      signal, value,
      weight: SIGNAL_WEIGHTS[signal] ?? 0,
      interpretation: INTERPRETATIONS[signal]?.(value) ?? signal,
    }))
    .sort((a, b) => b.weight * b.value - a.weight * a.value)
    .slice(0, 3);
}
