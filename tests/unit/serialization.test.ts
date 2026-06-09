import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBigInt, toBigIntString, safeNumber } from '@/lib/shared/bigint';
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

test('serializeBigInt deep-converts arrays and nested objects, preserves other types', () => {
  const input = { a: 1n, b: [2n, { c: 3n }], d: null, e: 'x', f: 4, g: true };
  const out = serializeBigInt(input) as any;
  assert.equal(out.a, '1');
  assert.equal(out.b[0], '2');
  assert.equal(out.b[1].c, '3');
  assert.equal(out.d, null);
  assert.equal(out.e, 'x');
  assert.equal(out.f, 4);
  assert.equal(out.g, true);
});

test('toBigIntString and safeNumber handle nullish + numeric inputs', () => {
  assert.equal(toBigIntString(null), null);
  assert.equal(toBigIntString(undefined), null);
  assert.equal(toBigIntString(10n), '10');
  assert.equal(toBigIntString(7), '7');
  assert.equal(safeNumber(null), null);
  assert.equal(safeNumber(5n), 5);
  assert.equal(safeNumber(9), 9);
});
