// scripts/jobs-summary.ts
// Prints the latest run per job from job_runs — used by coldstart.sh and
// handy standalone: DATABASE_URL=... npx tsx scripts/jobs-summary.ts
import 'dotenv/config';
import { db } from '@/lib/db';

type Row = {
  jobName: string;
  status: string;
  rowsWritten: number | null;
  durationMs: number | null;
  startedAt: Date;
};

async function main() {
  const rows = await db.$queryRawUnsafe<Row[]>(`
    SELECT DISTINCT ON ("jobName")
      "jobName", status, "rowsWritten", "durationMs", "startedAt"
    FROM job_runs
    ORDER BY "jobName", "startedAt" DESC
  `);

  if (!rows.length) {
    console.log('  (no job runs recorded yet)');
  }
  for (const r of rows) {
    const mark = r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '…';
    console.log(
      `  ${mark} ${r.jobName.padEnd(28)} rows=${String(r.rowsWritten ?? '-').padEnd(6)} ` +
        `${String(r.durationMs ?? '-').padEnd(7)}ms  ${r.startedAt.toISOString().slice(0, 16)}Z`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
