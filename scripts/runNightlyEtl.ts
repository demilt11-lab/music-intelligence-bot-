// scripts/runNightlyEtl.ts
import { runUgcTrackEtl } from '@/jobs/etl/ugcTracks';
import { runGenreEtl } from '@/jobs/etl/genres';

async function main() {
  const referenceDate = process.argv[2];
  console.log('[ETL] starting nightly ETL', referenceDate ?? '(today)');
  await runUgcTrackEtl(referenceDate);
  await runGenreEtl(referenceDate);
  console.log('[ETL] done');
}

main().catch((err) => {
  console.error('[ETL] failed', err);
  process.exit(1);
});
