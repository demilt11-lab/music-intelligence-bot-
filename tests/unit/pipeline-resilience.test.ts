import { test } from 'node:test'
import assert from 'node:assert/strict'

// ── Error-rate threshold logic (extracted from luminate.ts) ───────────────────

function shouldFailOnErrorRate(errors: number, trackCount: number): boolean {
  const maxPossibleErrors = trackCount * 3 // 3 API calls per track
  if (maxPossibleErrors === 0) return false
  return errors / maxPossibleErrors > 0.5
}

test('no tracks → never fails on error rate', () => {
  assert.equal(shouldFailOnErrorRate(0, 0), false)
})

test('zero errors with tracks → does not fail', () => {
  assert.equal(shouldFailOnErrorRate(0, 10), false)
})

test('exactly 50% errors → does not fail (threshold is strictly > 0.5)', () => {
  // 10 tracks * 3 calls = 30 max; 15 errors = 50% exactly
  assert.equal(shouldFailOnErrorRate(15, 10), false)
})

test('more than 50% errors → fails job', () => {
  // 10 tracks * 3 calls = 30 max; 16 errors = 53%
  assert.equal(shouldFailOnErrorRate(16, 10), true)
})

test('100% error rate → fails job', () => {
  // 5 tracks * 3 = 15 max; all 15 errors
  assert.equal(shouldFailOnErrorRate(15, 5), true)
})

test('single track, 2 of 3 endpoints fail → fails job (67%)', () => {
  assert.equal(shouldFailOnErrorRate(2, 1), true)
})

test('single track, 1 of 3 endpoints fails → does not fail (33%)', () => {
  assert.equal(shouldFailOnErrorRate(1, 1), false)
})

// ── Consecutive failure detection (mirrors tracker.ts logic) ──────────────────

const THRESHOLD = 3

function isConsecutiveFailureAlert(recentStatuses: string[]): boolean {
  return (
    recentStatuses.length >= THRESHOLD &&
    recentStatuses.every((s) => s === 'failed')
  )
}

test('fewer than threshold consecutive failures → no alert', () => {
  assert.equal(isConsecutiveFailureAlert(['failed', 'failed']), false)
})

test('exactly threshold consecutive failures → alert', () => {
  assert.equal(isConsecutiveFailureAlert(['failed', 'failed', 'failed']), true)
})

test('success in recent runs → no alert', () => {
  assert.equal(isConsecutiveFailureAlert(['failed', 'success', 'failed']), false)
})

test('empty run history → no alert', () => {
  assert.equal(isConsecutiveFailureAlert([]), false)
})

test('all success → no alert', () => {
  assert.equal(isConsecutiveFailureAlert(['success', 'success', 'success']), false)
})
