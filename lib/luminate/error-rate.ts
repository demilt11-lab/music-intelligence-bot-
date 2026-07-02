// lib/luminate/error-rate.ts
//
// Pure decision logic for jobs/ingest/luminate.ts. Deliberately has zero
// imports so it can be unit-tested without a database connection.

/**
 * 3 API calls per track (streams, sales, airplay) — if more than half of the
 * possible calls errored, treat the whole run as failed rather than
 * reporting a quietly-degraded partial success.
 */
export function shouldFailOnErrorRate(errors: number, trackCount: number): boolean {
  const maxPossibleErrors = trackCount * 3;
  if (maxPossibleErrors === 0) return false;
  return errors / maxPossibleErrors > 0.5;
}
