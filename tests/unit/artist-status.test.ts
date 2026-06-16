import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTIST_TRAJECTORY_STATUSES,
  isArtistTrajectoryStatus,
} from '@/lib/shared/artist-status';
import { classifyArtistStatus } from '@/jobs/etl/compute_artist_signals';
import { CLASSES } from '@/lib/ml/models/artist-trajectory';

// Guards BUG-004: compute_artist_signals classified chart veterans as
// "ESTABLISHED", a status no consumer (breaking API, /artists, analytics) and
// not the trajectory model recognized. Those artists returned 0 across every
// status filter while analytics showed them under a hidden cohort.

test('canonical status set matches the trajectory model classes (by membership)', () => {
  assert.deepEqual(
    [...ARTIST_TRAJECTORY_STATUSES].sort(),
    [...CLASSES].sort(),
    'producers and the ML model must agree on the status vocabulary',
  );
});

test('isArtistTrajectoryStatus accepts canonical, rejects ESTABLISHED', () => {
  for (const s of ARTIST_TRAJECTORY_STATUSES) {
    assert.equal(isArtistTrajectoryStatus(s), true);
  }
  assert.equal(isArtistTrajectoryStatus('ESTABLISHED'), false);
  assert.equal(isArtistTrajectoryStatus('stable'), false); // case-sensitive
  assert.equal(isArtistTrajectoryStatus(null), false);
});

test('classifyArtistStatus only ever emits canonical statuses', () => {
  // Sweep a wide grid of inputs, including the chart-veteran case that used to
  // return the non-canonical "ESTABLISHED".
  for (const streams7dDelta of [-1, -0.5, -0.21, 0, 0.16, 0.6, 2]) {
    for (const tiktok of [0, 0.21, 0.31, 1]) {
      for (const viral of [0, 0.51, 1]) {
        for (const weeksOnChart of [0, 3, 4, 12]) {
          const status = classifyArtistStatus(streams7dDelta, tiktok, viral, weeksOnChart);
          assert.ok(
            isArtistTrajectoryStatus(status),
            `non-canonical status "${status}" for inputs ` +
              `(${streams7dDelta}, ${tiktok}, ${viral}, ${weeksOnChart})`,
          );
        }
      }
    }
  }
});

test('a flat chart veteran classifies as STABLE (not ESTABLISHED)', () => {
  // 8 weeks on chart, no acceleration/decline → STABLE in the canonical set.
  assert.equal(classifyArtistStatus(0, 0, 0, 8), 'STABLE');
});

test('breakout and momentum cases still classify as before', () => {
  assert.equal(classifyArtistStatus(0.6, 0.31, 0.51, 0), 'ABOUT_TO_BREAK');
  assert.equal(classifyArtistStatus(0.2, 0, 0, 0), 'GROWING');
  assert.equal(classifyArtistStatus(-0.5, 0, 0, 0), 'DECLINING');
  assert.equal(classifyArtistStatus(0, 0, 0, 0), 'STABLE');
});
