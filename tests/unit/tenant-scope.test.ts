/**
 * Tests for the tenant-scoping choke point (lib/platform/tenant-scope.ts).
 *
 * These run in the fast (no-DB) unit suite so the isolation guarantee is
 * enforced on every push, complementing the live cross-tenant API test in
 * scripts/smoke.ts (which proves it end-to-end against real Postgres).
 *
 * The invariants under test are the ones a strict enterprise review demands:
 *   - a query can never be built without a valid tenant (fail closed), and
 *   - a caller can never override the scoped tenant to reach another tenant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tenantScopedWhere,
  assertOwnedByTenant,
} from '@/lib/platform/tenant-scope';

test('injects tenantId from a bare number', () => {
  assert.deepEqual(tenantScopedWhere(7, { entityType: 'track' }), {
    entityType: 'track',
    tenantId: 7,
  });
});

test('injects tenantId from a RequestContext-shaped source', () => {
  assert.deepEqual(tenantScopedWhere({ tenantId: 42 }, { id: 1 }), {
    id: 1,
    tenantId: 42,
  });
});

test('defaults to an empty where when none is given', () => {
  assert.deepEqual(tenantScopedWhere(3), { tenantId: 3 });
});

test('a matching caller-supplied tenantId is allowed (idempotent)', () => {
  assert.deepEqual(tenantScopedWhere(5, { tenantId: 5, id: 9 }), {
    tenantId: 5,
    id: 9,
  });
});

test('a MISMATCHED caller-supplied tenantId is rejected (no cross-tenant escape)', () => {
  // The core attack: a caller tries to smuggle a different tenant into the where.
  assert.throws(
    () => tenantScopedWhere(5, { tenantId: 6 }),
    (err: any) => err.status === 403 && /Cross-tenant query blocked/.test(err.message),
  );
});

test('the scoped tenant always wins over a spread (regression on the old override bug)', () => {
  const result = tenantScopedWhere(5, { id: 1 } as any);
  assert.equal(result.tenantId, 5);
});

for (const bad of [undefined, null, 0, -1, 1.5, NaN, '3' as unknown]) {
  test(`fails closed on invalid tenantId: ${String(bad)}`, () => {
    assert.throws(
      () => tenantScopedWhere(bad as any, {}),
      (err: any) => err.status === 500 && /Refusing to build an unscoped query/.test(err.message),
    );
  });
}

test('assertOwnedByTenant returns the row when it belongs to the tenant', () => {
  const row = { tenantId: 8, id: 1 };
  assert.equal(assertOwnedByTenant(8, row), row);
});

test('assertOwnedByTenant passes null through unchanged', () => {
  assert.equal(assertOwnedByTenant(8, null), null);
});

test('assertOwnedByTenant throws 404 (not 403) for a foreign row — existence must not leak', () => {
  assert.throws(
    () => assertOwnedByTenant(8, { tenantId: 9, id: 1 }),
    (err: any) => err.status === 404,
  );
});
