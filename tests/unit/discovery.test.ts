import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rankWatchCandidates,
  streamGrowthRate,
  qualifiesAsWatch,
  type WatchCandidate,
} from '@/lib/talentScout/discovery'

function makeCandidate(overrides: Partial<WatchCandidate> = {}): WatchCandidate {
  return {
    trackId: 1,
    name: 'Test',
    artists: ['Artist'],
    streamsLast30d: 2_000_000,
    streamsPrior30d: 1_000_000,
    curatedPlaylistAddsLast30d: 8,
    curatedPlaylistAddsPrior30d: 3,
    ...overrides,
  }
}

test('streamGrowthRate computes MoM rate and clamps the range', () => {
  assert.equal(streamGrowthRate(2_000_000, 1_000_000), 1) // +100%
  assert.equal(streamGrowthRate(1_500_000, 1_000_000), 0.5) // +50%
  assert.equal(streamGrowthRate(0, 1_000_000), -1) // -100%, clamped floor
  // near-zero prior must not explode; clamped to +400%
  assert.equal(streamGrowthRate(1_000_000, 0), 4)
})

test('qualifiesAsWatch requires both signals trending up', () => {
  assert.ok(qualifiesAsWatch(makeCandidate()))
  // streams flat/down -> excluded
  assert.ok(!qualifiesAsWatch(makeCandidate({ streamsLast30d: 1_000_000, streamsPrior30d: 1_000_000 })))
  // curated features flat -> excluded
  assert.ok(!qualifiesAsWatch(makeCandidate({ curatedPlaylistAddsLast30d: 3, curatedPlaylistAddsPrior30d: 3 })))
})

test('rankWatchCandidates filters out non-qualifiers', () => {
  const pool = [
    makeCandidate({ trackId: 1 }), // qualifies
    makeCandidate({ trackId: 2, streamsLast30d: 900_000, streamsPrior30d: 1_000_000 }), // streams down
    makeCandidate({ trackId: 3, curatedPlaylistAddsLast30d: 5, curatedPlaylistAddsPrior30d: 5 }), // features flat
  ]
  const ranked = rankWatchCandidates(pool)
  assert.deepEqual(ranked.map((r) => r.trackId), [1])
})

test('rankWatchCandidates sorts by watchScore descending and stays in [0,1]', () => {
  const pool = [
    makeCandidate({ trackId: 1, streamsPrior30d: 1_000_000, streamsLast30d: 1_200_000, curatedPlaylistAddsPrior30d: 2, curatedPlaylistAddsLast30d: 3 }), // weak
    makeCandidate({ trackId: 2, streamsPrior30d: 500_000, streamsLast30d: 2_500_000, curatedPlaylistAddsPrior30d: 1, curatedPlaylistAddsLast30d: 14 }), // strong
    makeCandidate({ trackId: 3, streamsPrior30d: 1_000_000, streamsLast30d: 1_800_000, curatedPlaylistAddsPrior30d: 3, curatedPlaylistAddsLast30d: 8 }), // mid
  ]
  const ranked = rankWatchCandidates(pool)

  assert.equal(ranked[0].trackId, 2, 'strongest momentum ranks first')
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].watchScore >= ranked[i].watchScore, 'descending order')
  }
  for (const r of ranked) {
    assert.ok(r.watchScore >= 0 && r.watchScore <= 1, `score ${r.watchScore} out of range`)
  }
})

test('a single viral outlier does not collapse the rest of the pool to zero', () => {
  // p95 normalization is only robust with a realistically-sized pool: the
  // outlier must sit above the 95th percentile so it's excluded from the
  // denominator. 20 healthy movers + 1 extreme outlier exercises that.
  const fillers = Array.from({ length: 20 }, (_, i) =>
    makeCandidate({
      trackId: 100 + i,
      streamsPrior30d: 1_000_000,
      streamsLast30d: 1_900_000, // +90%
      curatedPlaylistAddsPrior30d: 2,
      curatedPlaylistAddsLast30d: 8,
    }),
  )
  const mover = makeCandidate({
    trackId: 2,
    streamsPrior30d: 1_000_000,
    streamsLast30d: 2_000_000, // +100%
    curatedPlaylistAddsPrior30d: 3,
    curatedPlaylistAddsLast30d: 9,
  })
  const outlier = makeCandidate({
    trackId: 1,
    streamsPrior30d: 1_000,
    streamsLast30d: 50_000_000,
    curatedPlaylistAddsPrior30d: 1,
    curatedPlaylistAddsLast30d: 200,
  })

  const ranked = rankWatchCandidates([outlier, mover, ...fillers])
  const mid = ranked.find((r) => r.trackId === 2)!
  // robust p95 normalization keeps a healthy mover well above zero
  assert.ok(mid.watchScore > 0.3, `expected meaningful score, got ${mid.watchScore}`)
})

test('returns empty when nothing qualifies', () => {
  const pool = [makeCandidate({ streamsLast30d: 500_000, streamsPrior30d: 1_000_000 })]
  assert.deepEqual(rankWatchCandidates(pool), [])
})
