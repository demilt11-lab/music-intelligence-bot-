import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCronSecret } from '@/lib/platform/cron-auth';

// Minimal stub matching the only surface verifyCronSecret touches.
function mockReq(authHeader?: string): any {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' && authHeader !== undefined
          ? authHeader
          : null,
    },
  };
}

// Guards P1-3: when CRON_SECRET is unset, the old code compared against the
// literal string "Bearer undefined", so anyone could pass that header.
test('verifyCronSecret fails closed when CRON_SECRET is unset', () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    assert.equal(verifyCronSecret(mockReq('Bearer undefined')), false);
    assert.equal(verifyCronSecret(mockReq('Bearer ')), false);
    assert.equal(verifyCronSecret(mockReq('')), false);
    assert.equal(verifyCronSecret(mockReq(undefined)), false);
  } finally {
    if (prev !== undefined) process.env.CRON_SECRET = prev;
  }
});

test('verifyCronSecret accepts the correct token and rejects everything else', () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 's3cr3t-value';
  try {
    assert.equal(verifyCronSecret(mockReq('Bearer s3cr3t-value')), true);
    assert.equal(verifyCronSecret(mockReq('Bearer wrong')), false);
    assert.equal(verifyCronSecret(mockReq('s3cr3t-value')), false); // missing prefix
    assert.equal(verifyCronSecret(mockReq('Bearer s3cr3t-value ')), false); // trailing space
    assert.equal(verifyCronSecret(mockReq(undefined)), false);
  } finally {
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  }
});
