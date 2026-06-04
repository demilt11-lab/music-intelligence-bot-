/**
 * Daily ingestion: fetch metrics for top N artists, write snapshots.
 * Designed to be called by a cron job (see app/api/cron/ingest/route.ts).
 *
 * Async, non-blocking per-artist. If one artist fails, others continue.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";
import type { IngestionResult, ArtistMetrics } from "./types";
import { fetchArtistMetricsBatch } from "./artist-fetcher";
import { writeSnapshots, createIngestionJob, updateIngestionJob } from "./snapshot-writer";

export async function runDailyIngestion(options?: {
  limit?: number;
  concurrency?: number;
  date?: Date;
  dryRun?: boolean;
}): Promise<IngestionResult> {
  const limit = options?.limit ?? 10_000;
  const concurrency = options?.concurrency ?? 20;
  const date = options?.date ?? new Date();
  const dryRun = options?.dryRun ?? false;

  const startedAt = Date.now();
  const jobId = await createIngestionJob("daily_snapshot", { limit, dryRun });

  logger.info("Daily ingestion started", { jobId, limit, dryRun });

  let artistIds: number[] = [];
  try {
    const artists = await prisma.artist.findMany({
      orderBy: [{ popularity: "desc" }, { followersCount: "desc" }],
      take: limit,
      select: { id: true },
    });
    artistIds = artists.map((a) => a.id);
  } catch (err) {
    const msg = `Failed to fetch artist IDs: ${String(err)}`;
    logger.error(msg, { jobId });
    await updateIngestionJob(jobId, {
      status: "failed",
      errorLog: msg,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }

  const artistsTotal = artistIds.length;
  const errors: Array<{ artistId: number; error: string }> = [];
  let artistsDone = 0;
  let artistsFailed = 0;

  // Fetch metrics in batches
  const batchResults = await fetchArtistMetricsBatch(artistIds, date, concurrency);

  const successfulMetrics: ArtistMetrics[] = [];
  for (const [artistId, result] of batchResults.entries()) {
    if (result instanceof Error) {
      artistsFailed++;
      errors.push({ artistId, error: result.message });
      logger.debug("Artist fetch failed", { artistId, error: result.message });
    } else {
      artistsDone++;
      successfulMetrics.push(result);
    }
  }

  // Write snapshots unless dry run
  if (!dryRun && successfulMetrics.length > 0) {
    try {
      const writeResult = await writeSnapshots(successfulMetrics, "ingestion_cron");
      logger.info("Snapshots written", { jobId, ...writeResult });
    } catch (err) {
      const msg = `Failed to write snapshots: ${String(err)}`;
      logger.error(msg, { jobId });
      await updateIngestionJob(jobId, {
        status: "failed",
        artistsDone,
        artistsFailed,
        errorLog: msg,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  }

  const durationMs = Date.now() - startedAt;
  const failureRate = artistsTotal > 0 ? artistsFailed / artistsTotal : 0;
  const finalStatus = failureRate > 0.1 ? "partial" : "completed";

  await updateIngestionJob(jobId, {
    status: finalStatus,
    artistsDone,
    artistsFailed,
    errorLog: errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : undefined,
    completedAt: new Date(),
    durationMs,
  });

  logger.info("Daily ingestion completed", {
    jobId,
    artistsTotal,
    artistsDone,
    artistsFailed,
    durationMs,
    status: finalStatus,
  });

  return {
    jobId,
    artistsTotal,
    artistsDone,
    artistsFailed,
    durationMs,
    errors,
  };
}
