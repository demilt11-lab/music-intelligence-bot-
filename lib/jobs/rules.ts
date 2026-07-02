// lib/jobs/rules.ts
//
// Pure decision logic for job-run health, used by lib/jobs/tracker.ts.
// Deliberately has zero imports (no @/lib/db) so it can be unit-tested
// without a database connection, and so a regression in these rules can
// only be caught by testing the rules themselves, not a reimplementation.

export const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const ZERO_ROW_ALERT_THRESHOLD = 3;

/** True when the N most recent runs all failed. */
export function isConsecutiveFailureAlert(recentStatuses: string[]): boolean {
  return (
    recentStatuses.length >= CONSECUTIVE_FAILURE_THRESHOLD &&
    recentStatuses.every((s) => s === 'failed')
  );
}

/**
 * True when the current run wrote 0 rows AND the prior (THRESHOLD - 1) runs
 * also wrote 0 (null treated as 0) — i.e. this would be the THRESHOLD'th
 * consecutive zero-row run.
 */
export function shouldTriggerZeroRowAlert(
  currentRowsWritten: number,
  priorRunRowCounts: Array<number | null>,
): boolean {
  if (currentRowsWritten !== 0) return false;
  const priorZeros = priorRunRowCounts.filter((n) => (n ?? 0) === 0).length;
  return (
    priorRunRowCounts.length >= ZERO_ROW_ALERT_THRESHOLD - 1 &&
    priorZeros === ZERO_ROW_ALERT_THRESHOLD - 1
  );
}
