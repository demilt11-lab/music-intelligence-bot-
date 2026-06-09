import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination, paginatedResponse } from '@/lib/shared/pagination';

const sp = (q: string) => new URLSearchParams(q);

test('parsePagination applies defaults when params are absent', () => {
  assert.deepEqual(parsePagination(sp('')), { limit: 50, offset: 0 });
});

test('parsePagination parses valid limit/offset', () => {
  assert.deepEqual(parsePagination(sp('limit=10&offset=20')), { limit: 10, offset: 20 });
});

test('parsePagination rejects invalid input', () => {
  assert.throws(() => parsePagination(sp('offset=-1')), /non-negative/);
  assert.throws(() => parsePagination(sp('limit=0')), /positive/);
  assert.throws(() => parsePagination(sp('limit=abc')), /positive/);
});

test('parsePagination enforces maxLimit and the absolute ceiling', () => {
  assert.throws(() => parsePagination(sp('limit=500'), 50, 100), /must not exceed 100/);
  assert.throws(() => parsePagination(sp('limit=9999&offset=9999')), /must not exceed 10000/);
});

test('paginatedResponse wraps data with offset + total metadata', () => {
  assert.deepEqual(paginatedResponse([{ id: 1 }], 42, 10), {
    obj: [{ id: 1 }],
    offset: 10,
    total: 42,
  });
});
