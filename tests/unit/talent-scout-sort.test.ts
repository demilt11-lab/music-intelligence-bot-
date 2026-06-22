import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortTracks, SORT_KEYS, SORT_LABELS, type SortKey } from '@/lib/talentScout/sort'

type Track = {
  trackId: number
  totalScore: number
  tiktokVelocity: number
  spotifyStreamsLatest: string | null
}

function makeTrack(overrides: Partial<Track> & Pick<Track, 'trackId'>): Track {
  return {
    totalScore: 0,
    tiktokVelocity: 0,
    spotifyStreamsLatest: null,
    ...overrides,
  }
}

const FIXTURE: Track[] = [
  // High AI score, low TikTok velocity, low Spotify streams
  makeTrack({ trackId: 1, totalScore: 0.9, tiktokVelocity: 20, spotifyStreamsLatest: '100000' }),
  // Medium AI score, highest TikTok velocity, medium Spotify streams
  makeTrack({ trackId: 2, totalScore: 0.6, tiktokVelocity: 150, spotifyStreamsLatest: '500000' }),
  // Low AI score, low TikTok velocity, highest Spotify streams
  makeTrack({ trackId: 3, totalScore: 0.3, tiktokVelocity: 5, spotifyStreamsLatest: '8000000' }),
  // Lowest AI score, medium TikTok velocity, no Spotify streams
  makeTrack({ trackId: 4, totalScore: 0.1, tiktokVelocity: 80, spotifyStreamsLatest: null }),
]

test('sortTracks does not mutate the input array', () => {
  const original = FIXTURE.slice()
  sortTracks(FIXTURE, 'consistency')
  assert.deepEqual(
    FIXTURE.map((t) => t.trackId),
    original.map((t) => t.trackId),
    'source array must remain unmodified',
  )
})

test('breakout sort orders by totalScore descending', () => {
  const result = sortTracks(FIXTURE, 'breakout')
  assert.deepEqual(result.map((t) => t.trackId), [1, 2, 3, 4])
})

test('playlist sort orders by spotifyStreamsLatest descending (null treated as 0)', () => {
  const result = sortTracks(FIXTURE, 'playlist')
  // Track 3 has 8 000 000, track 2 has 500 000, track 1 has 100 000, track 4 has null → 0
  assert.deepEqual(result.map((t) => t.trackId), [3, 2, 1, 4])
})

test('consistency sort orders by tiktokVelocity descending', () => {
  const result = sortTracks(FIXTURE, 'consistency')
  // 150 > 80 > 20 > 5
  assert.deepEqual(result.map((t) => t.trackId), [2, 4, 1, 3])
})

test('all three sort keys produce distinct orderings on the fixture data', () => {
  const orders = SORT_KEYS.map((key) => sortTracks(FIXTURE, key).map((t) => t.trackId))
  // Verify each pair of orderings differs
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      assert.notDeepEqual(
        orders[i],
        orders[j],
        `sort keys at index ${i} and ${j} must produce different orderings`,
      )
    }
  }
})

test('SORT_KEYS covers every key that has a label', () => {
  const labelKeys = Object.keys(SORT_LABELS) as SortKey[]
  assert.deepEqual(
    [...SORT_KEYS].sort(),
    labelKeys.sort(),
    'SORT_KEYS and SORT_LABELS must cover the same set of keys',
  )
})

test('sortTracks handles an empty array without throwing', () => {
  for (const key of SORT_KEYS) {
    assert.deepEqual(sortTracks([], key), [], `empty array should stay empty for key "${key}"`)
  }
})
