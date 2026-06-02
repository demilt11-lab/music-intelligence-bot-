// scripts/runNightlyEtl.ts
import { runUgcTrackEtl } from '@/jobs/etl/ugcTracks';
import { runGenreEtl } from '@/jobs/etl/genres';
import { computeTrackSignals } from '@/jobs/etl/compute_track_signals';

async function main() {
  const referenceDate = process.argv[2];
  const dateStr =
    referenceDate ??
    new Date().toISOString().slice(0, 10);
  console.log('[ETL] starting nightly ETL', dateStr);
  await runUgcTrackEtl(referenceDate);
  await runGenreEtl(referenceDate);
  await computeTrackSignals(dateStr);
  console.log('[ETL] done');
}

main().catch((err) => {
  console.error('[ETL] failed', err);
  process.exit(1);
});
