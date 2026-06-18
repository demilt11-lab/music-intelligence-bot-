// app/api/ui/pipeline-status/route.ts
//
// Operational status for the data pipeline: latest run per job, recent
// failures, and source freshness. Session-protected — this is the page an
// operator opens first when something looks wrong.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSession, AuthError } from '@/lib/auth/guard';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSession(req);

    const [latestRuns, recentFailures, lastReconcile] = await Promise.all([
      db.$queryRawUnsafe<
        {
          jobName: string;
          status: string;
          startedAt: Date;
          durationMs: number | null;
          rowsWritten: number | null;
          error: string | null;
        }[]
      >(
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
        select: {
          jobName: true,
          startedAt: true,
          durationMs: true,
          error: true,
        },
      }),
      db.jobRun.findFirst({
        where: { jobName: 'etl:reconcile', status: { in: ['success', 'failed'] } },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, status: true, meta: true },
      }),
    ]);

    return NextResponse.json({
      obj: {
        jobs: latestRuns,
        recentFailures,
        lastReconcile,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error('[ui/pipeline-status]', err);
    return NextResponse.json({ error: 'Failed to load pipeline status' }, { status: 500 });
  }
}
