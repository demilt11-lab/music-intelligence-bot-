import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashApiKey } from '@/lib/platform/auth';

// API keys are stored only as sha256 hashes; the lookup hashes the incoming key
// and matches on keyHash. These invariants protect that auth path.
test('hashApiKey produces a deterministic 64-char sha256 hex digest', () => {
  const h1 = hashApiKey('my-secret-key');
  const h2 = hashApiKey('my-secret-key');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashApiKey produces different digests for different keys', () => {
  assert.notEqual(hashApiKey('key-a'), hashApiKey('key-b'));
});
