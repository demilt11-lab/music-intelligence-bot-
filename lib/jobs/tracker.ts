import { db } from '@/lib/db';

export type JobResult = Record<string, unknown> & { rowsWritten?: number };

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const ZERO_ROW_ALERT_THRESHOLD = 3;

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

      if (rowsWritten === 0) {
        try {
          const priorRuns = await db.jobRun.findMany({
            where: {
              jobName,
              id: { not: runId },
              status: { in: ['success', 'failed'] },
            },
            orderBy: { startedAt: 'desc' },
            take: ZERO_ROW_ALERT_THRESHOLD - 1,
            select: { rowsWritten: true },
          });

          const priorZeros = priorRuns.filter((r) => (r.rowsWritten ?? 0) === 0).length;

          if (
            priorRuns.length >= ZERO_ROW_ALERT_THRESHOLD - 1 &&
            priorZeros === ZERO_ROW_ALERT_THRESHOLD - 1
          ) {
            throw new Error(
              `ZERO_ROW_ALERT: ${jobName} has written 0 rows for ${ZERO_ROW_ALERT_THRESHOLD} consecutive runs`,
            );
          }

          if (priorZeros > 0) {
            console.warn(
              `[job-tracker] zero-row warning: ${jobName} wrote 0 rows (${priorZeros + 1} consecutive)`,
            );
          }
        } catch (zeroErr) {
          if ((zeroErr as Error).message?.startsWith('ZERO_ROW_ALERT')) throw zeroErr;
          console.warn(`[job-tracker] could not check zero-row threshold for ${jobName}:`, zeroErr);
        }
      }

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

      try {
        const recentRuns = await db.jobRun.findMany({
          where: { jobName, status: { in: ['success', 'failed'] } },
          orderBy: { startedAt: 'desc' },
          take: CONSECUTIVE_FAILURE_THRESHOLD,
          select: { status: true },
        });

        if (
          recentRuns.length >= CONSECUTIVE_FAILURE_THRESHOLD &&
          recentRuns.every((r) => r.status === 'failed')
        ) {
          console.error(
            `[job-tracker] CONSECUTIVE_FAILURE_ALERT: ${jobName} has failed ${recentRuns.length} consecutive times`,
            JSON.stringify({ jobName, consecutiveFailures: recentRuns.length }),
          );
        }
      } catch {
        // best-effort — do not mask the original job error
      }
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
