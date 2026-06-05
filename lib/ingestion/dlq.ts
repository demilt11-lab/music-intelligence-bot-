import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";

export interface DlqEntry {
  artistId: number;
  error: string;
  runDate: string;   // YYYY-MM-DD
  attempts: number;
}

/**
 * Persist exhausted-retry failures as a DLQ record in the ingestion_jobs
 * table (jobType="dlq"). No new schema needed. A separate replay job can
 * query for status="pending_replay" and retry these artists.
 */
export async function sendToDlq(
  entries: DlqEntry[],
  runJobId: number
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.ingestionJob.create({
      data: {
        jobType: "dlq",
        status: "pending_replay",
        artistsFailed: entries.length,
        errorLog: JSON.stringify(entries),
        metadata: { sourceJobId: runJobId, count: entries.length },
      },
    });
    logger.warn("Exhausted retries — sent to DLQ", {
      count: entries.length,
      sourceJobId: runJobId,
    });
  } catch (err) {
    // DLQ write must never crash the main pipeline
    logger.error("Failed to write DLQ record", { error: String(err) });
  }
}

export async function getDlqPending(limit = 500): Promise<DlqEntry[]> {
  const jobs = await prisma.ingestionJob.findMany({
    where: { jobType: "dlq", status: "pending_replay" },
    orderBy: { startedAt: "asc" },
    take: limit,
    select: { errorLog: true },
  });
  return jobs.flatMap((j) => {
    try {
      return JSON.parse(j.errorLog ?? "[]") as DlqEntry[];
    } catch {
      return [];
    }
  });
}
