import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const FeedbackSchema = z.object({
  predictionId: z.number().int().positive().optional(),
  artistId: z.number().int().positive(),
  actualBrokeOut: z.boolean(),
  chartedAt: z.string().datetime().optional(),
  chartName: z.string().max(100).optional(),
  peakChartRank: z.number().int().min(1).max(200).optional(),
  source: z.enum(["manual", "billboard_api", "chart_monitor"]).default("manual"),
});

export const POST = withAuth("signals:write", async (req) => {
  const body = await req.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  // Find the most recent pending prediction for this artist
  const outcome = await prisma.predictionOutcome.findFirst({
    where: { artistId: data.artistId, evaluated: false },
    orderBy: { predictedAt: "desc" },
  });

  if (!outcome) {
    return NextResponse.json({ error: "No pending prediction found for this artist" }, { status: 404 });
  }

  const wasCorrect = (outcome.breakoutProb >= 0.5) === data.actualBrokeOut;

  const updated = await prisma.predictionOutcome.update({
    where: { id: outcome.id },
    data: {
      actualBrokeOut: data.actualBrokeOut,
      chartedAt: data.chartedAt ? new Date(data.chartedAt) : null,
      chartName: data.chartName,
      peakChartRank: data.peakChartRank,
      feedbackSource: data.source,
      wasCorrect,
      evaluated: true,
      evaluatedAt: new Date(),
      outcomeAt: new Date(),
    },
  });

  // Check if we've accumulated enough cases to trigger retraining
  const unprocessedCount = await prisma.predictionOutcome.count({
    where: { evaluated: true, wasCorrect: { not: null } },
    // In a real system, filter by "since last retrain"
  });

  const shouldTriggerRetrain = unprocessedCount % 100 === 0 && unprocessedCount > 0;
  if (shouldTriggerRetrain) {
    // Write trigger file for Python watchdog
    // In production, this would use a job queue
    await writeTriggerFile(unprocessedCount);
  }

  return NextResponse.json({
    updated: true,
    outcomeId: updated.id,
    wasCorrect,
    triggerredRetrain: shouldTriggerRetrain,
    totalEvaluated: unprocessedCount,
  });
});

async function writeTriggerFile(newCases: number) {
  try {
    const { writeFile, mkdir } = await import("fs/promises");
    await mkdir("ml/outputs", { recursive: true });
    await writeFile(
      "ml/outputs/.retrain_trigger",
      JSON.stringify({ new_labeled_cases: newCases, triggered_by: "feedback_threshold", triggered_at: new Date().toISOString() })
    );
  } catch { /* non-fatal */ }
}
