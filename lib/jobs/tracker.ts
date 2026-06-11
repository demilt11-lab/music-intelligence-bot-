// lib/jobs/tracker.ts
//
// Wraps ingest/ETL entrypoints so every execution is recorded in job_runs:
// status, duration, rows written, and the error when one occurs. Powers the
// pipeline-status endpoint, the Analytics ops panel, and staleness checks.
//
// Tracking is best-effort by design — a broken DB connection must surface as
// the job's own failure, not as a tracker crash masking it.
import { db } from '@/lib/db';

export type JobResult = Record<string, unknown> & { rowsWritten?: number };

export async function runTrackedJob<T extends JobResult | void>(
  jobName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  let runId: number | null = null;

  try {
    const run = await db.jobRun.create({
      data: { jobName, status: 'running', startedAt },
      select: { id: true },
    });
    runId = run.id;
  } catch (e) {
    console.warn(`[job-tracker] could not record start of ${jobName}:`, e);
  }

  try {
    const result = await fn();
    const finishedAt = new Date();

    if (runId != null) {
      const rowsWritten =
        result && typeof result === 'object' && 'rowsWritten' in result
          ? Number((result as JobResult).rowsWritten ?? 0)
          : extractRowCount(result);

      await db.jobRun
        .update({
          where: { id: runId },
          data: {
            status: 'success',
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            rowsWritten,
            meta: result && typeof result === 'object' ? (result as object) : undefined,
          },
        })
        .catch(() => {});
    }

    return result;
  } catch (err) {
    const finishedAt = new Date();
    if (runId != null) {
      await db.jobRun
        .update({
          where: { id: runId },
          data: {
            status: 'failed',
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            error: err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000),
          },
        })
        .catch(() => {});
    }
    throw err;
  }
}

/** Pull a row count out of common result shapes ({written}, {artists}, {labeled}...). */
function extractRowCount(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  for (const key of ['rowsWritten', 'written', 'labeled', 'artists', 'tracks', 'count']) {
    if (typeof r[key] === 'number') return r[key] as number;
  }
  return null;
}
