/**
 * Soundcharts ingest — mapping + windowing logic.
 *
 * Imports the real production modules (lib/integrations/soundcharts/
 * ingest-mapping.ts and the trajectory ETL's listener window) so these tests
 * exercise the code the job actually runs, not a copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toCanonicalPlatform,
  unwrapItems,
  extractUuid,
  normalizePlaylistEntry,
  diffTrackPlaylistMembership,
  normalizeListenerPoint,
  latestListenerPoint,
  PLAYLIST_PLATFORMS,
} from '../../lib/integrations/soundcharts/ingest-mapping';
import { computeListenerWindow } from '../../jobs/etl/artist_trajectory_snapshots';

// ─── Platform mapping ─────────────────────────────────────────────────────────

test('toCanonicalPlatform maps Soundcharts codes to directory platforms', () => {
  assert.equal(toCanonicalPlatform('apple-music'), 'applemusic');
  assert.equal(toCanonicalPlatform('amazon'), 'amazon');
  assert.equal(toCanonicalPlatform('APPLE-MUSIC'), 'applemusic');
  assert.equal(toCanonicalPlatform('unknown-platform'), null);
});

test('every ingested playlist platform has a canonical mapping', () => {
  for (const p of PLAYLIST_PLATFORMS) {
    assert.notEqual(toCanonicalPlatform(p), null, `missing canonical mapping for ${p}`);
  }
});

// ─── Envelope unwrapping ──────────────────────────────────────────────────────

test('unwrapItems handles items, obj, data envelopes and bare arrays', () => {
  const rows = [{ a: 1 }];
  assert.deepEqual(unwrapItems({ items: rows }), rows);
  assert.deepEqual(unwrapItems({ obj: rows }), rows);
  assert.deepEqual(unwrapItems({ data: rows }), rows);
  assert.deepEqual(unwrapItems(rows), rows);
  assert.deepEqual(unwrapItems({ obj: { not: 'an array' } }), []);
  assert.deepEqual(unwrapItems(null), []);
});

test('extractUuid finds the uuid across resolver response shapes', () => {
  assert.equal(extractUuid({ obj: { uuid: 'abc' } }), 'abc');
  assert.equal(extractUuid({ uuid: 'abc' }), 'abc');
  assert.equal(extractUuid({ obj: { song: { uuid: 'abc' } } }), 'abc');
  assert.equal(extractUuid({ obj: { artist: { uuid: 'abc' } } }), 'abc');
  assert.equal(extractUuid({ obj: {} }), null);
  assert.equal(extractUuid(null), null);
});

// ─── Playlist entry normalization ─────────────────────────────────────────────

test('normalizePlaylistEntry maps a nested playlist row', () => {
  const entry = normalizePlaylistEntry({
    position: 4,
    entryDate: '2026-06-20T00:00:00+00:00',
    playlist: {
      uuid: 'pl-uuid-1',
      name: 'Rap Life',
      type: 'editorial',
      countryCode: 'US',
      latestSubscriberCount: 1234567,
      trackCount: 100,
      curator: { name: 'Apple Music Hip-Hop' },
    },
  });

  assert.ok(entry);
  assert.equal(entry.playlistUuid, 'pl-uuid-1');
  assert.equal(entry.name, 'Rap Life');
  assert.equal(entry.curatorName, 'Apple Music Hip-Hop');
  assert.equal(entry.countryCode, 'US');
  assert.equal(entry.playlistType, 'editorial');
  assert.equal(entry.subscriberCount, 1234567n);
  assert.equal(entry.trackCount, 100);
  assert.equal(entry.position, 4);
  assert.equal(entry.entryDate, '2026-06-20');
});

test('normalizePlaylistEntry returns null without a playlist identity', () => {
  assert.equal(normalizePlaylistEntry({ playlist: { name: 'No UUID' } }), null);
  assert.equal(normalizePlaylistEntry({ playlist: { uuid: 'x' } }), null); // no name
  assert.equal(normalizePlaylistEntry(null), null);
  assert.equal(normalizePlaylistEntry('nope'), null);
});

test('normalizePlaylistEntry tolerates flat rows and string counts', () => {
  const entry = normalizePlaylistEntry({
    uuid: 'pl-2',
    name: 'Fresh Finds',
    subscriberCount: '42',
  });
  assert.ok(entry);
  assert.equal(entry.playlistUuid, 'pl-2');
  assert.equal(entry.subscriberCount, 42n);
  assert.equal(entry.position, null);
});

// ─── Membership diff ──────────────────────────────────────────────────────────

test('diffTrackPlaylistMembership computes adds and removes', () => {
  const { adds, removes } = diffTrackPlaylistMembership([1, 2, 3], [2, 3, 4]);
  assert.deepEqual(adds, [4]);
  assert.deepEqual(removes, [1]);
});

test('diffTrackPlaylistMembership handles empty sides', () => {
  assert.deepEqual(diffTrackPlaylistMembership([], [7]), { adds: [7], removes: [] });
  assert.deepEqual(diffTrackPlaylistMembership([7], []), { adds: [], removes: [7] });
  assert.deepEqual(diffTrackPlaylistMembership([], []), { adds: [], removes: [] });
});

// ─── Listener series ──────────────────────────────────────────────────────────

test('normalizeListenerPoint handles value and plots shapes', () => {
  assert.deepEqual(normalizeListenerPoint({ date: '2026-06-01', value: 1000 }), {
    date: '2026-06-01',
    value: 1000n,
  });
  assert.deepEqual(
    normalizeListenerPoint({ date: '2026-06-01T00:00:00+00:00', plots: [{ value: 5 }] }),
    { date: '2026-06-01', value: 5n },
  );
  assert.equal(normalizeListenerPoint({ date: '2026-06-01' }), null);
  assert.equal(normalizeListenerPoint({ value: 5 }), null);
});

test('latestListenerPoint picks the newest date', () => {
  const latest = latestListenerPoint([
    { date: '2026-06-01', value: 1n },
    { date: '2026-06-10', value: 3n },
    { date: '2026-06-05', value: 2n },
  ]);
  assert.deepEqual(latest, { date: '2026-06-10', value: 3n });
  assert.equal(latestListenerPoint([]), null);
});

// ─── Trajectory listener window (ETL) ─────────────────────────────────────────

test('computeListenerWindow returns latest value and 28d delta', () => {
  // 56 days: first 28 at 1000, last 28 ramping to 2000
  const series: (number | null)[] = [
    ...Array(28).fill(1000),
    ...Array(28).fill(2000),
  ];
  const w = computeListenerWindow(series);
  assert.equal(w.listeners28d, 2000n);
  assert.ok(Math.abs((w.listenersDelta28d ?? 0) - 1.0) < 1e-9);
});

test('computeListenerWindow tolerates sparse series with gaps', () => {
  const series: (number | null)[] = Array(56).fill(null);
  series[54] = 1500; // latest window has one reading
  series[20] = 1000; // baseline window has one reading
  const w = computeListenerWindow(series);
  assert.equal(w.listeners28d, 1500n);
  assert.ok(Math.abs((w.listenersDelta28d ?? 0) - 0.5) < 1e-9);
});

test('computeListenerWindow returns nulls when no listener data exists', () => {
  const w = computeListenerWindow(Array(90).fill(null));
  assert.equal(w.listeners28d, null);
  assert.equal(w.listenersDelta28d, null);
});

test('computeListenerWindow returns null delta without a baseline', () => {
  const w = computeListenerWindow([...Array(10).fill(null), 1200]);
  assert.equal(w.listeners28d, 1200n);
  assert.equal(w.listenersDelta28d, null);
});
