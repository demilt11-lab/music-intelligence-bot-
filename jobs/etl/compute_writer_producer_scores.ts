// jobs/etl/compute_writer_producer_scores.ts
// Usage: npx tsx jobs/etl/compute_writer_producer_scores.ts [YYYY-MM-DD]
import { runTrackedJob } from '@/lib/jobs/tracker';
import { upsertRisingScores } from '@/lib/writersProducers/risingScorer';

const dateArg = process.argv[2];
const date = dateArg ? new Date(dateArg) : new Date();
date.setUTCHours(0, 0, 0, 0);

await runTrackedJob('compute_writer_producer_scores', async () => {
  const written = await upsertRisingScores(date);
  console.log(`[writer-producer-scores] upserted ${written} scores for ${date.toISOString().split('T')[0]}`);
  return { rowsWritten: written };
});
