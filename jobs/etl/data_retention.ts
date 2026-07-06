/**
 * Data Retention Job — GDPR / CCPA compliance
 *
 * Purges time-bounded data that has no ongoing business need:
 *   - request_logs older than 30 days (contains endpoint + tenant metadata)
 *   - revoked/expired sessions older than 7 days (hashes only, no raw tokens)
 *   - job_runs older than 90 days (operational logs)
 *
 * This job does NOT delete tenant data, track records, or ML predictions —
 * those are customer assets with separate deletion handled via account deletion.
 *
 * Required env vars: DATABASE_URL
 */

import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main(): Promise<{ rowsWritten: number }> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Required env var DATABASE_URL is not set');
  }

  let totalDeleted = 0;

  // Request logs: 30-day retention
  const requestLogCutoff = daysAgo(30);
  const { count: logsDeleted } = await db.requestLog.deleteMany({
    where: { createdAt: { lt: requestLogCutoff } },
  });
  console.log(`[data-retention] Deleted ${logsDeleted} request_logs older than 30 days`);
  totalDeleted += logsDeleted;

  // Sessions: purge revoked or expired sessions older than 7 days
  const sessionCutoff = daysAgo(7);
  const { count: sessionsDeleted } = await db.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: sessionCutoff } },
        { expiresAt: { lt: sessionCutoff } },
      ],
    },
  });
  console.log(`[data-retention] Deleted ${sessionsDeleted} revoked/expired sessions older than 7 days`);
  totalDeleted += sessionsDeleted;

  // Job runs: 90-day retention
  const jobRunCutoff = daysAgo(90);
  const { count: jobRunsDeleted } = await db.jobRun.deleteMany({
    where: { startedAt: { lt: jobRunCutoff } },
  });
  console.log(`[data-retention] Deleted ${jobRunsDeleted} job_runs older than 90 days`);
  totalDeleted += jobRunsDeleted;

  // Error events: 90-day retention on aggregates not seen recently. A still-
  // firing error keeps a recent lastSeenAt and is retained.
  const errorEventCutoff = daysAgo(90);
  const { count: errorsDeleted } = await db.errorEvent.deleteMany({
    where: { lastSeenAt: { lt: errorEventCutoff } },
  });
  console.log(`[data-retention] Deleted ${errorsDeleted} error_events not seen in 90 days`);
  totalDeleted += errorsDeleted;

  console.log(`[data-retention] Total rows purged: ${totalDeleted}`);

  await db.$disconnect();
  return { rowsWritten: totalDeleted };
}

runTrackedJob('etl:data-retention', main).catch((err) => {
  console.error('[data-retention] Fatal error:', err);
  process.exit(1);
});
