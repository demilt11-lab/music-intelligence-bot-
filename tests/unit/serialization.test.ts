import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBigIntString } from '@/lib/shared/bigint';
import { bigintReplacer } from '@/lib/shared/response';

// These guard the P0-2 regression: the track route returned Prisma BigInt fields
// (totalStreams, tiktokCreations, youtubeViews) which crash JSON.stringify.

test('raw JSON.stringify throws on bigint (proves the hazard is real)', () => {
  assert.throws(() => JSON.stringify({ streams: 1n }), TypeError);
});

test('bigintReplacer serialises bigint leaves to strings without throwing', () => {
  const payload = {
    obj: {
      spotifyStreams: 5_000_000n,
      nested: { youtubeViews: 12_345_678_901_234_567_890n },
      plain: 42,
      name: 'track',
    },
  };
  const parsed = JSON.parse(JSON.stringify(payload, bigintReplacer));
  assert.equal(parsed.obj.spotifyStreams, '5000000');
  assert.equal(parsed.obj.nested.youtubeViews, '12345678901234567890');
  assert.equal(parsed.obj.plain, 42);
  assert.equal(parsed.obj.name, 'track');
});

test('toBigIntString handles nullish + numeric inputs', () => {
  assert.equal(toBigIntString(null), null);
  assert.equal(toBigIntString(undefined), null);
  assert.equal(toBigIntString(10n), '10');
  assert.equal(toBigIntString(7), '7');
});
