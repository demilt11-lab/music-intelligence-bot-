/**
 * Tests for the self-hosted observability primitives (lib/platform/observability.ts).
 * These guard the two properties the error-tracking layer depends on:
 *   - fingerprinting collapses semantically-identical errors to one row, and
 *   - latency percentiles are computed correctly for the APM surface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMessage,
  fingerprintError,
  latencyPercentiles,
} from '@/lib/platform/observability';

test('normalizeMessage strips volatile ids/numbers/literals', () => {
  assert.equal(normalizeMessage('User 12345 not found'), 'User <n> not found');
  assert.equal(
    normalizeMessage('record 550e8400-e29b-41d4-a716-446655440000 missing'),
    'record <uuid> missing',
  );
  assert.equal(normalizeMessage(`bad value 'abc' at 0xFF3A`), "bad value '<v>' at <hex>");
});

test('same error across occurrences → same fingerprint (aggregation works)', () => {
  const a = fingerprintError('/api/v1/tracks/[id]', 'Error', 'Track 111 not found');
  const b = fingerprintError('/api/v1/tracks/[id]', 'Error', 'Track 999 not found');
  assert.equal(a, b, 'ids in the message must not fork the fingerprint');
});

test('different route or error type → different fingerprint', () => {
  const base = fingerprintError('/api/v1/tracks/[id]', 'Error', 'boom');
  assert.notEqual(base, fingerprintError('/api/v1/artists/[id]', 'Error', 'boom'));
  assert.notEqual(base, fingerprintError('/api/v1/tracks/[id]', 'TypeError', 'boom'));
  assert.match(base, /^[0-9a-f]{32}$/);
});

test('latencyPercentiles handles the empty case', () => {
  assert.deepEqual(latencyPercentiles([]), { count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
});

test('latencyPercentiles computes rank-based percentiles', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  const p = latencyPercentiles(samples);
  assert.equal(p.count, 100);
  assert.equal(p.p50, 50);
  assert.equal(p.p95, 95);
  assert.equal(p.p99, 99);
  assert.equal(p.max, 100);
});

test('latencyPercentiles is order-independent', () => {
  const shuffled = [30, 10, 50, 20, 40];
  const p = latencyPercentiles(shuffled);
  assert.equal(p.p50, 30);
  assert.equal(p.max, 50);
});
