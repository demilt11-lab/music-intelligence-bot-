// lib/jobs/pipelineStatus.ts
//
// Shared query layer for ETL/ingest job status. Consumed by the admin-only
// pipeline route and the admin-only /admin/pipeline page (BUG-007) — raw job
// statuses and error text are an internal operability surface, never shown
// on user-facing pages.
import { db } from '@/lib/db';

export type JobStatusRow = {
  jobName: string;
  status: string;
  startedAt: Date;
  durationMs: number | null;
  rowsWritten: number | null;
  error: string | null;
};

export type RecentFailure = Pick<JobStatusRow, 'jobName' | 'startedAt' | 'durationMs' | 'error'>;

export type PipelineStatus = {
  jobs: JobStatusRow[];
  recentFailures: RecentFailure[];
  lastReconcile: { startedAt: Date; status: string; meta: unknown } | null;
};

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const [jobs, recentFailures, lastReconcile] = await Promise.all([
    db.$queryRawUnsafe<JobStatusRow[]>(
      `SELECT DISTINCT ON ("jobName")
         "jobName", status, "startedAt", "durationMs", "rowsWritten", error
       FROM job_runs
       ORDER BY "jobName", "startedAt" DESC`,
    ),
    db.jobRun.findMany({
      where: {
        status: 'failed',
        startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { jobName: true, startedAt: true, durationMs: true, error: true },
    }),
    db.jobRun.findFirst({
      where: { jobName: 'etl:reconcile', status: { in: ['success', 'failed'] } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, status: true, meta: true },
    }),
  ]);

  return { jobs, recentFailures, lastReconcile };
}
