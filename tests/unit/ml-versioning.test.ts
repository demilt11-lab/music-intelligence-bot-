/**
 * Tests for the model rollback selection (lib/ml/versioning.ts pickRollbackVersion).
 * The DB plumbing is exercised by scripts (and CI smoke against real Postgres);
 * the interesting decision — which version a rollback targets — is pure and
 * locked down here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRollbackVersion } from '@/lib/ml/versioning';

const history = [{ version: 1 }, { version: 2 }, { version: 3 }];

test('defaults to the immediate predecessor of the active version', () => {
  assert.equal(pickRollbackVersion(history, 3), 2);
  assert.equal(pickRollbackVersion(history, 2), 1);
});

test('honors an explicit target version when it exists', () => {
  assert.equal(pickRollbackVersion(history, 3, 1), 1);
});

test('rejects an explicit target that is not in history (404)', () => {
  assert.throws(() => pickRollbackVersion(history, 3, 99), (e: any) => e.status === 404);
});

test('rejects when there is no prior version to roll back to (409)', () => {
  assert.throws(() => pickRollbackVersion([{ version: 1 }], 1), (e: any) => e.status === 409);
});

test('predecessor is the highest version strictly below active, not just active-1', () => {
  // Gaps in the history (e.g. a rejected promotion) must still resolve correctly.
  assert.equal(pickRollbackVersion([{ version: 1 }, { version: 4 }, { version: 5 }], 5), 4);
});
