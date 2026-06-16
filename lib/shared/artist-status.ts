// lib/shared/artist-status.ts
//
// Single source of truth for the artist trajectory status vocabulary.
//
// Every PRODUCER (the rule-based ETL, the compute-artist-signals ETL, the ML
// trajectory model) and every CONSUMER (the breaking-artists API, the /artists
// dashboard, the analytics cohorts, the MCP tool) must use exactly these four
// values. A producer that emits anything else writes rows that are invisible
// to all status-filtered views and out-of-vocabulary for the trajectory model.
//
// This was the root cause of BUG-004: compute_artist_signals classified
// chart-veteran artists as "ESTABLISHED", a fifth value no consumer knew. Once
// that ETL became the latest snapshot, /artists returned 0 for every filter
// while analytics showed the artists under a hidden cohort.
//
// Ordered high → low momentum priority (display/priority order). NOTE: the ML
// model's CLASSES array (lib/ml/models/artist-trajectory.ts) lists the same set
// in ascending order because class *index* is significant there; keep the two
// in sync by membership, not order.

export const ARTIST_TRAJECTORY_STATUSES = [
  'ABOUT_TO_BREAK',
  'GROWING',
  'STABLE',
  'DECLINING',
] as const;

export type ArtistTrajectoryStatus = (typeof ARTIST_TRAJECTORY_STATUSES)[number];

/** Runtime guard — true when `v` is one of the canonical status strings. */
export function isArtistTrajectoryStatus(v: unknown): v is ArtistTrajectoryStatus {
  return (
    typeof v === 'string' &&
    (ARTIST_TRAJECTORY_STATUSES as readonly string[]).includes(v)
  );
}
