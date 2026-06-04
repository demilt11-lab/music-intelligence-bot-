import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const windowDays = 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  // Find all PredictionOutcome where evaluated = false AND predictedAt < NOW() - 90 days
  const pending = await prisma.predictionOutcome.findMany({
    where: {
      evaluated: false,
      predictedAt: { lt: cutoff },
    },
    select: {
      id: true,
      artistId: true,
      breakoutProb: true,
      predictedAt: true,
    },
  });

  logger.info("Evaluating pending prediction outcomes", { count: pending.count, cutoff });

  if (pending.length === 0) {
    return NextResponse.json({ evaluated: 0, correct: 0, accuracy: null });
  }

  // Get all unique artistIds so we can batch-look up chart appearances
  const artistIds = [...new Set(pending.map((p) => p.artistId))];

  // For each artist, find the earliest chart appearance after their predictedAt date
  // by looking up tracks via TrackArtist → ChartRow → ChartSnapshot
  const artistChartMap = new Map<
    number,
    { chartedAt: Date; chartName: string; peakRank: number } | null
  >();

  for (const artistId of artistIds) {
    try {
      const trackIds = await prisma.trackArtist.findMany({
        where: { artistId },
        select: { trackId: true },
      });

      if (trackIds.length === 0) {
        artistChartMap.set(artistId, null);
        continue;
      }

      const ids = trackIds.map((t) => t.trackId);

      // Find the best (lowest) chart rank across all tracks in the evaluation window
      const bestRow = await prisma.chartRow.findFirst({
        where: { trackId: { in: ids } },
        orderBy: { rank: "asc" },
        select: {
          rank: true,
          snapshot: {
            select: {
              snapshotDate: true,
              chartName: true,
            },
          },
        },
      });

      if (bestRow) {
        artistChartMap.set(artistId, {
          chartedAt: bestRow.snapshot.snapshotDate,
          chartName: bestRow.snapshot.chartName,
          peakRank: bestRow.rank,
        });
      } else {
        artistChartMap.set(artistId, null);
      }
    } catch (err) {
      logger.debug("Chart lookup failed for artist", { artistId, error: String(err) });
      artistChartMap.set(artistId, null);
    }
  }

  let evaluatedCount = 0;
  let correctCount = 0;
  const now = new Date();

  // Update each PredictionOutcome
  await Promise.allSettled(
    pending.map(async (prediction) => {
      const chartInfo = artistChartMap.get(prediction.artistId) ?? null;
      const actualBrokeOut = chartInfo !== null;
      const predictedBreakout = prediction.breakoutProb >= 0.5;
      const wasCorrect = predictedBreakout === actualBrokeOut;

      await prisma.predictionOutcome.update({
        where: { id: prediction.id },
        data: {
          actualBrokeOut,
          chartedAt: chartInfo?.chartedAt ?? null,
          chartName: chartInfo?.chartName ?? null,
          peakChartRank: chartInfo?.peakRank ?? null,
          wasCorrect,
          evaluated: true,
          evaluatedAt: now,
          outcomeAt: now,
          feedbackSource: "chart_monitor",
        },
      });

      evaluatedCount++;
      if (wasCorrect) correctCount++;
    })
  );

  const accuracy = evaluatedCount > 0 ? correctCount / evaluatedCount : null;

  logger.info("Outcome evaluation complete", { evaluated: evaluatedCount, correct: correctCount, accuracy });

  return NextResponse.json({ evaluated: evaluatedCount, correct: correctCount, accuracy });
}
