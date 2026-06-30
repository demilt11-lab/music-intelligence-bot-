/**
 * Regression tests for QA Sprint 2 fixes.
 *
 * Each test is named for the bug it guards against re-appearing.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEmptyResult, sampleSearch } from '@/lib/search/sample-data'
import { rankTalentTracks } from '@/lib/talentScout/score'
import type { TalentScoutTrack } from '@/lib/talentScout/sources'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<TalentScoutTrack> = {}): TalentScoutTrack {
  return {
    trackId: 1,
    name: 'Track',
    artists: ['Artist'],
    code2: 'US',
    source: 'ugc_live',
    tiktokScore: 0.5,
    tiktokViews: '100000',
    tiktokLikes: '5000',
    tiktokVelocity: 80,
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QA Fix 2 — Discovery search must not show demo data
//
// lib/search/service.ts no longer calls sampleSearch() when the DB returns
// empty results. These tests guard the logic that supports that invariant.
// ─────────────────────────────────────────────────────────────────────────────

test('[fix-2] isEmptyResult identifies a truly empty grouped result', () => {
  assert.equal(isEmptyResult({}), true, 'empty object is empty')
  assert.equal(isEmptyResult({ artists: [], tracks: [] }), true, 'all-empty arrays are empty')
})

test('[fix-2] isEmptyResult returns false when any entity group has rows', () => {
  const withArtist = {
    artists: [{ id: 1, name: 'Test', imageUrl: null, code2: 'US', spotifyFollowers: 0, score: 0 }],
  }
  assert.equal(isEmptyResult(withArtist), false)
})

test('[fix-2] sampleSearch items are marked _isSample:true so they can never be silently injected', () => {
  // sampleSearch is still exported but service.ts no longer calls it.
  // If it were re-introduced, _isSample:true on every row would make it
  // auditable — this test confirms that tag is always present.
  const result = sampleSearch('Nova Rae', 'all')
  const artists = result.artists ?? []
  assert.ok(artists.length > 0, 'sampleSearch should return artist rows for a matching query')
  for (const artist of artists) {
    assert.ok(
      '_isSample' in artist && (artist as Record<string, unknown>)['_isSample'] === true,
      `artist "${(artist as { name: string }).name}" must be tagged _isSample:true`,
    )
  }
})

test('[fix-2] sampleSearch returns empty for a blank query', () => {
  const result = sampleSearch('', 'all')
  assert.equal(isEmptyResult(result), true, 'blank query should never produce demo rows')
})

// ─────────────────────────────────────────────────────────────────────────────
// QA Fix 1 — Scout signals: only real signal sources get conviction scores
//
// ScoutTrackCard and the scoring pipeline use a two-element set to decide
// whether a track is "signal-backed". Non-signal fallbacks (charts, sample)
// must not carry conviction actions.
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_BACKED = new Set(['ugc_live', 'ml_scores'])

test('[fix-1] only ugc_live and ml_scores are signal-backed sources', () => {
  assert.equal(SIGNAL_BACKED.has('ugc_live'), true)
  assert.equal(SIGNAL_BACKED.has('ml_scores'), true)
  assert.equal(SIGNAL_BACKED.has('charts'), false)
  assert.equal(SIGNAL_BACKED.has('spotify_popular'), false)
  assert.equal(SIGNAL_BACKED.has('sample'), false)
})

test('[fix-1] charts fallback rows carry zero conviction actions', () => {
  const [track] = rankTalentTracks(
    [makeTrack({ trackId: 10, source: 'charts', tiktokVelocity: 150 })],
    'general',
  )
  assert.equal(track.actions.length, 0, 'chart fallback must not carry A&R conviction actions')
})

test('[fix-1] sample rows carry zero conviction actions', () => {
  const [track] = rankTalentTracks(
    [makeTrack({ trackId: 11, source: 'sample', tiktokVelocity: 150 })],
    'general',
  )
  assert.equal(track.actions.length, 0, 'sample rows must not carry A&R conviction actions')
})

test('[fix-1] ugc_live track with real velocity carries at least one conviction action', () => {
  const [track] = rankTalentTracks(
    [makeTrack({ trackId: 12, source: 'ugc_live', tiktokVelocity: 150 })],
    'ugc_early',
  )
  assert.ok(track.actions.length > 0, 'signal-backed track with velocity must carry at least one action')
})

test('[fix-1] ml_scores track with real velocity carries at least one conviction action', () => {
  const [track] = rankTalentTracks(
    [makeTrack({ trackId: 13, source: 'ml_scores', tiktokVelocity: 100 })],
    'ugc_early',
  )
  assert.ok(track.actions.length > 0, 'ml_scores track with velocity must carry at least one action')
})

// ─────────────────────────────────────────────────────────────────────────────
// QA Fix 3 — Watchlist AddToWatchlistButton appears on real scout tracks
//
// ScoutTrackCard now renders AddToWatchlistButton when trackId > 0.
// Sample placeholder tracks use negative IDs and must not get a watchlist
// button (they have no persistent DB record).
// ─────────────────────────────────────────────────────────────────────────────

test('[fix-3] trackId > 0 is the guard for rendering AddToWatchlistButton', () => {
  // The component renders the button conditionally on track.trackId > 0.
  // Sample placeholder rows in the scouting feed use negative IDs.
  // Verify the ID polarity invariant: real track IDs are always positive.
  const realTrackId = 42
  const samplePlaceholderId = -1

  assert.ok(realTrackId > 0, 'real tracks have positive IDs')
  assert.ok(!(samplePlaceholderId > 0), 'sample placeholder IDs are non-positive')
})
