/**
 * Regression tests for the pooled DATABASE_URL normalization.
 *
 * Guards the production-pipeline outage where workflows appended
 * `?pgbouncer=true&connection_limit=1` to a secret that already had a query
 * string, producing an invalid double-"?" URL that Prisma rejected with
 * "the provided arguments are not supported in database URL".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePooledUrl } from '@/lib/db'

function countQuestionMarks(s: string): number {
  return (s.match(/\?/g) ?? []).length
}

test('returns undefined for empty input', () => {
  assert.equal(normalizePooledUrl(undefined), undefined)
  assert.equal(normalizePooledUrl(null), undefined)
  assert.equal(normalizePooledUrl(''), undefined)
})

test('adds pooler params to a clean connection string', () => {
  const out = normalizePooledUrl('postgresql://u:p@host:6543/postgres')!
  assert.ok(out.includes('pgbouncer=true'), 'has pgbouncer')
  assert.ok(out.includes('connection_limit=1'), 'has connection_limit')
  assert.equal(countQuestionMarks(out), 1, 'exactly one "?"')
  assert.doesNotThrow(() => new URL(out), 'is a valid URL')
})

test('preserves an existing query param (e.g. sslmode)', () => {
  const out = normalizePooledUrl('postgresql://u:p@host:6543/postgres?sslmode=require')!
  assert.ok(out.includes('sslmode=require'), 'keeps sslmode')
  assert.ok(out.includes('pgbouncer=true'), 'adds pgbouncer')
  assert.ok(out.includes('connection_limit=1'), 'adds connection_limit')
  assert.equal(countQuestionMarks(out), 1, 'exactly one "?"')
})

test('is idempotent when pgbouncer is already present', () => {
  const out = normalizePooledUrl('postgresql://u:p@host:6543/postgres?pgbouncer=true')!
  assert.equal(countQuestionMarks(out), 1)
  // pgbouncer appears exactly once (not duplicated)
  assert.equal((out.match(/pgbouncer=true/g) ?? []).length, 1)
  assert.doesNotThrow(() => new URL(out))
})

test('repairs the double-"?" corruption that caused the outage', () => {
  // This is the exact malformed shape the workflows produced when the secret
  // already ended in "?pgbouncer=true".
  const broken =
    'postgresql://u:p@host:6543/postgres?pgbouncer=true?pgbouncer=true&connection_limit=1'
  const out = normalizePooledUrl(broken)!
  assert.equal(countQuestionMarks(out), 1, 'collapses to a single "?"')
  assert.ok(!out.includes('true?'), 'no stray "?" inside the query')
  assert.ok(out.includes('pgbouncer=true'))
  assert.ok(out.includes('connection_limit=1'))
  assert.doesNotThrow(() => new URL(out), 'repaired URL parses cleanly')
})
