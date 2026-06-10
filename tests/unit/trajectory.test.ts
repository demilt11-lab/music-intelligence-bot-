import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windowSum,
  pctDelta,
  computeWindowDeltas,
  classifyStatus,
  inferBreakoutRegionAndGenre,
} from '@/jobs/etl/artist_trajectory_snapshots';

test('windowSum sums exactly the trailing window', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(windowSum(values, 9, 3), 27); // 8+9+10
  assert.equal(windowSum(values, 9, 100), 55); // whole series when window exceeds it
  assert.equal(windowSum(values, 0, 7), 1);
  assert.equal(windowSum(values, -1, 7), 0);
});

test('pctDelta handles zero/null baselines without fake growth', () => {
  assert.equal(pctDelta(100, null), 0);
  assert.equal(pctDelta(100, 0), 0);
  assert.equal(pctDelta(150, 100), 0.5);
  assert.equal(pctDelta(50, 100), -0.5);
});

test('computeWindowDeltas compares non-overlapping windows', () => {
  // 14 days: first 7 days at 100/day, last 7 days at 200/day → 7d delta = +100%
  const streams = [...Array(7).fill(100), ...Array(7).fill(200)];
  const flat = Array(14).fill(0);

  const deltas = computeWindowDeltas(streams, flat, flat);

  assert.equal(deltas.streams7d, 1400);
  assert.equal(deltas.streams7dDelta, 1); // (1400 - 700) / 700
  // Not enough history for a full 28d baseline → no claim, not inflation
  assert.equal(deltas.streams28dDelta, 0);
  assert.equal(deltas.streams90dDelta, 0);
});

test('computeWindowDeltas reads playlist/follower baselines 28 days back', () => {
  const days = 30;
  const streams = Array(days).fill(10);
  const playlists = Array(days)
    .fill(0)
    .map((_, i) => (i < days - 28 ? 10 : i === days - 1 ? 15 : 10));
  const followers = Array(days)
    .fill(0)
    .map((_, i) => 1000 + i * 10);

  const deltas = computeWindowDeltas(streams, playlists, followers);
  assert.equal(deltas.playlistsDelta28d, 0.5); // 15 vs 10
  // followers: latest=1290, 28 back=1010 → (1290-1010)/1010
  assert.ok(Math.abs(deltas.followersDelta28d - 280 / 1010) < 1e-9);
});

test('classifyStatus tiers behave at the documented thresholds', () => {
  const aboutToBreak = classifyStatus({
    streams28dDelta: 1.2,
    playlistsDelta28d: 0.6,
    followersDelta28d: 0.3,
  });
  assert.equal(aboutToBreak.status, 'ABOUT_TO_BREAK');
  assert.ok(aboutToBreak.breakProbability <= 1);

  const growing = classifyStatus({
    streams28dDelta: 0.5,
    playlistsDelta28d: 0,
    followersDelta28d: 0,
  });
  assert.equal(growing.status, 'GROWING');

  const declining = classifyStatus({
    streams28dDelta: -0.5,
    playlistsDelta28d: -0.2,
    followersDelta28d: 0,
  });
  assert.equal(declining.status, 'DECLINING');

  const stable = classifyStatus({
    streams28dDelta: 0,
    playlistsDelta28d: 0,
    followersDelta28d: 0,
  });
  assert.equal(stable.status, 'STABLE');
});

test('classifyStatus viral boost can lift GROWING into ABOUT_TO_BREAK', () => {
  const base = {
    streams28dDelta: 0.9,
    playlistsDelta28d: 0.6,
    followersDelta28d: 0.3,
  };
  assert.equal(classifyStatus(base).status, 'GROWING');
  assert.equal(
    classifyStatus({ ...base, tiktokVelocityScore: 0.5 }).status,
    'ABOUT_TO_BREAK',
  );
});

test('inferBreakoutRegionAndGenre weights viral probability highest', () => {
  const result = inferBreakoutRegionAndGenre([
    { trackId: 1, genre: 'pop', code2: 'US', probViral: 0.9, probTrending: 0, probPopular: 0 },
    { trackId: 2, genre: 'rap', code2: 'GB', probViral: 0, probTrending: 0.9, probPopular: 0 },
  ]);
  // 0.9 * 1.5 (viral) beats 0.9 * 1.0 (trending)
  assert.equal(result.primaryGenre, 'pop');
  assert.equal(result.primaryCode2, 'US');
  assert.equal(result.breakoutRegions.length, 2);
});
