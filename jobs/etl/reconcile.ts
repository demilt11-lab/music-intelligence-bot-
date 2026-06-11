// jobs/etl/reconcile.ts
//
// Nightly data-integrity reconciliation. Verifies cross-table invariants and
// signal freshness, and reports findings instead of letting bad joins or
// stale sources silently degrade rankings. Exits non-zero when any check is
// at "error" severity so the scheduler surfaces it.
import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';

export type ReconcileIssue = {
  check: string;
  severity: 'info' | 'warn' | 'error';
  count: number;
  detail: string;
};

const STALENESS_LIMITS_DAYS: Record<string, { warn: number; error: number }> = {
  ugc_track_metrics: { warn: 3, error: 7 },
  talent_scout_scores: { warn: 3, error: 7 },
  artist_daily_stats: { warn: 3, error: 7 },
  trajectory_snapshots: { warn: 3, error: 7 },
  chart_snapshots: { warn: 7, error: 14 },
};

function ageDays(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export async function reconcile(): Promise<{
  ok: boolean;
  issues: ReconcileIssue[];
  rowsWritten: number;
}> {
  const issues: ReconcileIssue[] = [];

  // ── 1. Referential integrity: signals pointing at missing tracks ─────────
  const orphanChecks: Array<{ name: string; sql: string }> = [
    {
      name: 'orphaned_talent_scout_scores',
      sql: `SELECT COUNT(*)::int AS n FROM talent_scout_scores s
            LEFT JOIN tracks t ON t.id = s."trackId" WHERE t.id IS NULL`,
    },
    {
      name: 'orphaned_ugc_track_metrics',
      sql: `SELECT COUNT(*)::int AS n FROM ugc_track_metrics u
            LEFT JOIN tracks t ON t.id = u."trackId" WHERE t.id IS NULL`,
    },
    {
      name: 'orphaned_trajectory_snapshots',
      sql: `SELECT COUNT(*)::int AS n FROM "ArtistTrajectorySnapshot" s
            LEFT JOIN artists a ON a.id = s."artistId" WHERE a.id IS NULL`,
    },
  ];

  for (const check of orphanChecks) {
    const [{ n }] = await db.$queryRawUnsafe<[{ n: number }]>(check.sql);
    if (n > 0) {
      issues.push({
        check: check.name,
        severity: 'error',
        count: n,
        detail: `${n} rows reference entities that no longer exist`,
      });
    }
  }

  // ── 2. Value ranges: probabilities/scores must stay in [0, 1] ────────────
  const [{ n: badViral }] = await db.$queryRawUnsafe<[{ n: number }]>(
    `SELECT COUNT(*)::int AS n FROM talent_scout_scores
     WHERE "viralScore" < 0 OR "viralScore" > 1`,
  );
  if (badViral > 0) {
    issues.push({
      check: 'viral_score_range',
      severity: 'error',
      count: badViral,
      detail: `${badViral} viral scores outside [0,1]`,
    });
  }

  const [{ n: badProb }] = await db.$queryRawUnsafe<[{ n: number }]>(
    `SELECT COUNT(*)::int AS n FROM "ArtistTrajectorySnapshot"
     WHERE "breakProbability" < 0 OR "breakProbability" > 1`,
  );
  if (badProb > 0) {
    issues.push({
      check: 'break_probability_range',
      severity: 'error',
      count: badProb,
      detail: `${badProb} break probabilities outside [0,1]`,
    });
  }

  // ── 3. Duplicate snapshots (must be impossible under the unique index) ───
  const dupes = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT "artistId", "date" FROM "ArtistTrajectorySnapshot"
       GROUP BY "artistId", "date" HAVING COUNT(*) > 1
     ) d`,
  );
  if (dupes[0]?.n > 0) {
    issues.push({
      check: 'duplicate_trajectory_snapshots',
      severity: 'error',
      count: dupes[0].n,
      detail: `${dupes[0].n} (artist, date) pairs have multiple snapshots`,
    });
  }

  // ── 4. Signal freshness ───────────────────────────────────────────────────
  const [ugc, scores, daily, snapshot, chart] = await Promise.all([
    db.ugcTrackMetrics.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.talentScoutScore.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.artistDailyStats.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.artistTrajectorySnapshot.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.chartSnapshot.findFirst({ orderBy: { snapshotDate: 'desc' }, select: { snapshotDate: true } }),
  ]);

  const freshness: Record<string, Date | null> = {
    ugc_track_metrics: ugc?.date ?? null,
    talent_scout_scores: scores?.date ?? null,
    artist_daily_stats: daily?.date ?? null,
    trajectory_snapshots: snapshot?.date ?? null,
    chart_snapshots: chart?.snapshotDate ?? null,
  };

  for (const [source, latest] of Object.entries(freshness)) {
    const age = ageDays(latest);
    const limits = STALENESS_LIMITS_DAYS[source];
    if (age == null) {
      issues.push({
        check: `staleness_${source}`,
        severity: 'info',
        count: 0,
        detail: 'no data yet (source never ingested)',
      });
    } else if (age >= limits.error) {
      issues.push({
        check: `staleness_${source}`,
        severity: 'error',
        count: age,
        detail: `latest data is ${age} days old (limit ${limits.error})`,
      });
    } else if (age >= limits.warn) {
      issues.push({
        check: `staleness_${source}`,
        severity: 'warn',
        count: age,
        detail: `latest data is ${age} days old`,
      });
    }
  }

  // ── 5. Recent job failures ────────────────────────────────────────────────
  const failedJobs = await db.jobRun.groupBy({
    by: ['jobName'],
    where: {
      status: 'failed',
      startedAt: { gte: new Date(Date.now() - 48 * 3600_000) },
    },
    _count: { _all: true },
  });
  for (const f of failedJobs) {
    issues.push({
      check: `job_failures_${f.jobName}`,
      severity: 'warn',
      count: f._count._all,
      detail: `${f._count._all} failed run(s) of ${f.jobName} in the last 48h`,
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const ok = errors.length === 0;

  console.log(
    `[reconcile] checks complete — ${issues.length} finding(s), ${errors.length} error(s)`,
  );
  for (const i of issues) {
    console.log(`  [${i.severity.toUpperCase()}] ${i.check}: ${i.detail}`);
  }

  return { ok, issues, rowsWritten: issues.length };
}

if (require.main === module) {
  runTrackedJob('etl:reconcile', reconcile)
    .then(({ ok }) => {
      console.log(ok ? 'Reconciliation passed' : 'Reconciliation found ERROR-level issues');
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
