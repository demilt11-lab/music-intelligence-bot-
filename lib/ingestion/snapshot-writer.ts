import { prisma } from "@/lib/prisma";
import type { ArtistMetrics } from "./types";

const BATCH_SIZE = 500;

export async function writeSnapshots(
  metrics: ArtistMetrics[],
  source: string = "ingestion_cron"
): Promise<{ written: number; skipped: number; errors: number }> {
  let written = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((m) => {
        const date = new Date(m.date);
        return prisma.artistDailySnapshot.upsert({
          where: { artistId_date: { artistId: m.artistId, date } },
          create: {
            artistId: m.artistId,
            date,
            streamVelocity: m.streamVelocity,
            playlistRate: m.playlistRate,
            ugcCount: m.ugcCount,
            followerGrowth: m.followerGrowth,
            saveRate: m.saveRate,
            skipRate: m.skipRate,
            tiktokUses7d: m.tiktokUses7d,
            preSaveCount: m.preSaveCount,
            radioSpins: m.radioSpins,
            chartRank: m.chartRank,
            source,
          },
          update: {
            streamVelocity: m.streamVelocity,
            playlistRate: m.playlistRate,
            ugcCount: m.ugcCount,
            followerGrowth: m.followerGrowth,
            saveRate: m.saveRate,
            skipRate: m.skipRate,
            tiktokUses7d: m.tiktokUses7d,
            preSaveCount: m.preSaveCount,
            radioSpins: m.radioSpins,
            chartRank: m.chartRank,
            source,
          },
        });
      })
    ).then(
      (results) => {
        written += results.length;
      },
      (err) => {
        // On batch transaction failure, count all as errors rather than skipped
        // (could be unique constraint or other DB error)
        const isUniqueConstraint =
          err?.code === "P2002" ||
          String(err).includes("Unique constraint");
        if (isUniqueConstraint) {
          skipped += batch.length;
        } else {
          errors += batch.length;
        }
      }
    );
  }

  return { written, skipped, errors };
}

export async function createIngestionJob(
  jobType: string,
  metadata?: Record<string, unknown>
): Promise<number> {
  const job = await prisma.ingestionJob.create({
    data: {
      jobType,
      status: "running",
      metadata: metadata ?? undefined,
    },
    select: { id: true },
  });
  return job.id;
}

export async function updateIngestionJob(
  jobId: number,
  update: Partial<{
    status: string;
    artistsDone: number;
    artistsFailed: number;
    errorLog: string;
    completedAt: Date;
    durationMs: number;
  }>
): Promise<void> {
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: update,
  });
}
