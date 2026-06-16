import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zScore, stats, severity } from '@/jobs/etl/anomaly_detection';

// Guards BUG-007's etl:anomaly fix: the job crashed in ~0.3s on every run
// because it queried db.ugcTrackMetric (singular, undefined on the Prisma
// client) instead of db.ugcTrackMetrics — a TypeError thrown before any of
// this math ever ran. These tests cover that math directly now that it's
// exported, so a future rename can't silently go untested again.

test('stats computes mean/std for a normal sample, and zeroes for an empty one', () => {
  const { mean, std } = stats([980, 1020, 990, 1010, 1000, 995, 1005]);
  assert.equal(mean, 1000);
  assert.ok(std > 0 && std < 15);

  assert.deepEqual(stats([]), { mean: 0, std: 0 });
});

test('zScore is 0 when the baseline has ~no variance, instead of dividing by zero', () => {
  assert.equal(zScore(5000, 1000, 0), 0);
  assert.equal(zScore(5000, 1000, 0.0005), 0);
});

test('zScore reflects how many baseline std-devs a value sits from the mean', () => {
  assert.equal(zScore(1000, 1000, 50), 0);
  assert.equal(zScore(1100, 1000, 50), 2);
  assert.equal(zScore(900, 1000, 50), -2);
});

test('severity buckets by absolute z-score and ignores sub-threshold noise', () => {
  assert.equal(severity(1.0), null);
  assert.equal(severity(2.0), 'low');
  assert.equal(severity(-3.0), 'medium');
  assert.equal(severity(4.5), 'high');
  assert.equal(severity(-4.5), 'high');
});

test('the seeded BUG-007 repro scenario (1000 baseline, 5000 spike) reads as a high-severity anomaly', () => {
  const { mean, std } = stats([980, 1020, 990, 1010, 1000, 995, 1005]);
  const z = zScore(5000, mean, std);
  assert.equal(severity(z), 'high');
  assert.ok(z > 0, 'a positive spike should auto-watchlist, per the high&z>0 branch');
});
