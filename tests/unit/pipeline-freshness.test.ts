import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshnessStatus, FRESHNESS_SLA_HOURS } from '@/lib/jobs/freshness'
import { shouldTriggerZeroRowAlert } from '@/lib/jobs/rules'

// ── freshnessStatus ───────────────────────────────────────────────────────────

test('null date → date=null, ageHours=null, fresh=false', () => {
  const s = freshnessStatus(null)
  assert.equal(s.date, null)
  assert.equal(s.ageHours, null)
  assert.equal(s.fresh, false)
})

test('undefined date → date=null, ageHours=null, fresh=false', () => {
  const s = freshnessStatus(undefined)
  assert.equal(s.date, null)
  assert.equal(s.ageHours, null)
  assert.equal(s.fresh, false)
})

test('date 1 hour ago → fresh=true', () => {
  const d = new Date(Date.now() - 1 * 3_600_000)
  const s = freshnessStatus(d)
  assert.equal(s.fresh, true)
  assert.ok(s.ageHours !== null && s.ageHours >= 1 && s.ageHours < 2)
})

test('date exactly at SLA boundary is still fresh', () => {
  const d = new Date(Date.now() - FRESHNESS_SLA_HOURS * 3_600_000)
  const s = freshnessStatus(d)
  assert.equal(s.fresh, true)
})

test('date 1ms past SLA is stale', () => {
  const d = new Date(Date.now() - FRESHNESS_SLA_HOURS * 3_600_000 - 1)
  const s = freshnessStatus(d)
  assert.equal(s.fresh, false)
})

test('date 48 hours ago → fresh=false', () => {
  const d = new Date(Date.now() - 48 * 3_600_000)
  const s = freshnessStatus(d)
  assert.equal(s.fresh, false)
  assert.ok(s.ageHours !== null && s.ageHours >= 48)
})

test('returns ISO string for date field', () => {
  const d = new Date('2026-01-15T12:00:00.000Z')
  const s = freshnessStatus(d)
  assert.equal(s.date, '2026-01-15T12:00:00.000Z')
})

test('ageHours is rounded to one decimal place', () => {
  // 1.5 hours ago
  const d = new Date(Date.now() - 1.5 * 3_600_000)
  const s = freshnessStatus(d)
  assert.ok(s.ageHours !== null)
  // Should be 1.5 (within floating point tolerance)
  const rounded = Math.round((s.ageHours - 1.5) * 10) / 10
  assert.ok(Math.abs(rounded) <= 0.1, `expected ageHours≈1.5, got ${s.ageHours}`)
})

// ── Zero-row consecutive detection ─────────────────────────────────────────────
// Imports the real function from lib/jobs/tracker.ts (used inside
// runTrackedJob to decide whether to throw ZERO_ROW_ALERT).

test('non-zero current run → no alert regardless of history', () => {
  assert.equal(shouldTriggerZeroRowAlert(5, [0, 0]), false)
})

test('zero current + zero prior history but fewer than threshold → no alert', () => {
  assert.equal(shouldTriggerZeroRowAlert(0, [0]), false)
})

test('zero current + exactly threshold-1 prior zeros → alert', () => {
  assert.equal(shouldTriggerZeroRowAlert(0, [0, 0]), true)
})

test('zero current + prior has a non-zero run → no alert', () => {
  assert.equal(shouldTriggerZeroRowAlert(0, [5, 0]), false)
})

test('zero current + empty prior history → no alert', () => {
  assert.equal(shouldTriggerZeroRowAlert(0, []), false)
})

test('zero current + null rowsWritten in prior treated as zero', () => {
  assert.equal(shouldTriggerZeroRowAlert(0, [null, null]), true)
})

test('FRESHNESS_SLA_HOURS constant is 25', () => {
  assert.equal(FRESHNESS_SLA_HOURS, 25)
})
