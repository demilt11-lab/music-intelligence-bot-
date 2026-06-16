// scripts/fix-established-status.ts
//
// Remediates ArtistTrajectorySnapshot rows left with the non-canonical status
// "ESTABLISHED" written by an older compute_artist_signals build (see BUG-004).
// Those rows are invisible to every status-filtered view (/artists, analytics
// cohorts) and out-of-vocabulary for the trajectory model. A chart-veteran that
// is neither accelerating nor declining is "STABLE" in the canonical
// vocabulary, so we re-map ESTABLISHED → STABLE in place.
//
// Safe by default: DRY RUN unless --apply is passed.
//
//   npx tsx scripts/fix-established-status.ts            # report only
//   npx tsx scripts/fix-established-status.ts --apply    # perform the update

import { db } from '@/lib/db';
import { ARTIST_TRAJECTORY_STATUSES } from '@/lib/shared/artist-status';

const APPLY = process.argv.includes('--apply');

function log(line: string): void {
  console.log(`[fix-established]${APPLY ? '' : ' (dry-run)'} ${line}`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  // Report any non-canonical statuses present, so we surface the full problem
  // rather than only the one we know about.
  const grouped = await db.artistTrajectorySnapshot.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const canonical = new Set<string>(ARTIST_TRAJECTORY_STATUSES);
  const offenders = grouped.filter((g) => !canonical.has(g.status));

  if (grouped.length) {
    log('current status distribution:');
    for (const g of grouped) {
      const flag = canonical.has(g.status) ? 'ok' : 'NON-CANONICAL';
      log(`  ${g.status.padEnd(16)} ${String(g._count._all).padStart(6)}  [${flag}]`);
    }
  }

  const establishedCount = grouped
    .filter((g) => g.status === 'ESTABLISHED')
    .reduce((n, g) => n + g._count._all, 0);

  if (establishedCount > 0) {
    log(`re-mapping ${establishedCount} ESTABLISHED row(s) → STABLE`);
    if (APPLY) {
      const res = await db.artistTrajectorySnapshot.updateMany({
        where: { status: 'ESTABLISHED' },
        data: { status: 'STABLE' },
      });
      log(`updated ${res.count} row(s).`);
    }
  } else {
    log('no ESTABLISHED rows found.');
  }

  const otherOffenders = offenders.filter((g) => g.status !== 'ESTABLISHED');
  if (otherOffenders.length) {
    log(
      `WARNING: other non-canonical statuses present and NOT auto-fixed: ${otherOffenders
        .map((g) => `${g.status} (${g._count._all})`)
        .join(', ')}. Review manually.`,
    );
  }

  if (!APPLY) log('no changes written. Re-run with --apply to perform the fix.');
  else log('remediation complete.');

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[fix-established] Fatal error:', err);
  process.exit(1);
});
