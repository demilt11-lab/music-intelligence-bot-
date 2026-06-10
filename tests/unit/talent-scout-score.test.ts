import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTalentTracks, clampScore } from '@/lib/talentScout/score';
import type { TalentScoutTrack } from '@/lib/talentScout/sources';

function makeTrack(overrides: Partial<TalentScoutTrack> = {}): TalentScoutTrack {
  return {
    trackId: 1,
    name: 'Test Track',
    artists: ['Test Artist'],
    code2: 'US',
    source: 'ugc_live',
    tiktokScore: 0,
    tiktokViews: '0',
    tiktokLikes: '0',
    tiktokVelocity: 0,
    spotifyStreamsLatest: null,
    spotifyPopularity: null,
    luminateStreamsLatest: null,
    luminateAudienceLatest: null,
    luminateSpinsLatest: null,
    youtubeViews: null,
    instagramPlays: null,
    viralScore: null,
    rightsComplexityScore: null,
    ...overrides,
  };
}

test('clampScore bounds values to [0, 1]', () => {
  assert.equal(clampScore(-0.5), 0);
  assert.equal(clampScore(0), 0);
  assert.equal(clampScore(0.42), 0.42);
  assert.equal(clampScore(1), 1);
  assert.equal(clampScore(1.7), 1);
  assert.equal(clampScore(NaN), 0);
});

test('rankTalentTracks never emits scores outside [0, 1]', () => {
  const tracks = [
    // Extreme velocity that would push the raw score above 1 without clamping
    makeTrack({ trackId: 1, tiktokVelocity: 300, tiktokScore: 1 }),
    // Heavy penalties that would push the raw score below 0
    makeTrack({
      trackId: 2,
      tiktokVelocity: -100,
      rightsComplexityScore: 1,
      spotifyStreamsLatest: '19000000',
    }),
  ];

  const ranked = rankTalentTracks(tracks, 'ugc_early');
  for (const t of ranked) {
    assert.ok(t.totalScore >= 0 && t.totalScore <= 1, `score ${t.totalScore} out of range`);
  }
});

test('rankTalentTracks sorts by score descending', () => {
  const tracks = [
    makeTrack({ trackId: 1, tiktokVelocity: 10 }),
    makeTrack({ trackId: 2, tiktokVelocity: 200 }),
    makeTrack({ trackId: 3, tiktokVelocity: 80 }),
  ];

  const ranked = rankTalentTracks(tracks, 'ugc_early');
  assert.deepEqual(
    ranked.map((t) => t.trackId),
    [2, 3, 1],
  );
});

test('ugc_early mode filters out tracks already past the pre-break threshold', () => {
  const tracks = [
    makeTrack({ trackId: 1, spotifyStreamsLatest: '25000000' }), // past 20M
    makeTrack({ trackId: 2, spotifyStreamsLatest: '1000000' }),
  ];

  const ranked = rankTalentTracks(tracks, 'ugc_early');
  assert.deepEqual(ranked.map((t) => t.trackId), [2]);

  // general mode keeps both
  const general = rankTalentTracks(tracks, 'general');
  assert.equal(general.length, 2);
});

test('actions are attached for signal-backed sources only', () => {
  const signal = makeTrack({ trackId: 1, source: 'ugc_live', tiktokVelocity: 120 });
  const chartFallback = makeTrack({ trackId: 2, source: 'charts', tiktokVelocity: 120 });
  const sample = makeTrack({ trackId: 3, source: 'sample', tiktokVelocity: 120 });

  const ranked = rankTalentTracks([signal, chartFallback, sample], 'general');

  const byId = new Map(ranked.map((t) => [t.trackId, t]));
  assert.ok((byId.get(1)?.actions.length ?? 0) > 0, 'signal track should carry actions');
  assert.equal(byId.get(2)?.actions.length, 0, 'chart fallback must not carry conviction actions');
  assert.equal(byId.get(3)?.actions.length, 0, 'sample rows must not carry conviction actions');
});

test('rights complexity adds a cleanup action for signal tracks', () => {
  const t = makeTrack({ trackId: 9, tiktokVelocity: 80, rightsComplexityScore: 0.8 });
  const [ranked] = rankTalentTracks([t], 'ugc_early');
  assert.ok(ranked.actions.some((a) => a.type === 'rights_cleanup'));
});
