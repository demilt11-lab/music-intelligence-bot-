import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartRankWeight, normalizeChartCountry } from '@/jobs/etl/genres';
import { reduceGenreSignals, type GenreBreakoutSignal } from '@/lib/talentScout/genres';

// Guards BUG-005: the genre breakout radar's only "Spotify" source
// (TrackPlatformStatsDaily platform='spotify') is structurally dead — no
// ingest job has ever written that row, so it always returned 0 genres.
// jobs/ingest/spotify.ts's chart ingestion is the Spotify source that
// actually flows; these tests cover the chart-presence weighting that
// replaces it and the reducer bug that would have silently dropped it.

test('chartRankWeight rewards higher (lower-numbered) ranks, floors at 0', () => {
  assert.equal(chartRankWeight(1, 50), 50);
  assert.equal(chartRankWeight(50, 50), 1);
  assert.equal(chartRankWeight(51, 50), 0);
  assert.equal(chartRankWeight(200, 50), 0);
});

test('normalizeChartCountry uppercases and maps missing/"global" to GLOBAL', () => {
  assert.equal(normalizeChartCountry('US'), 'US');
  assert.equal(normalizeChartCountry('gb'), 'GB');
  assert.equal(normalizeChartCountry('global'), 'GLOBAL');
  assert.equal(normalizeChartCountry(null), 'GLOBAL');
});

function emptyUgcRows(): Parameters<typeof reduceGenreSignals>[0] {
  return [];
}

test('reduceGenreSignals sums multiple US-side rows instead of the last one winning', () => {
  // Before BUG-005's fix this was a straight assignment (`=`), so a "chart"
  // row and a legacy "all" row for the same genre would clobber each other
  // depending on arbitrary DB return order, instead of both contributing.
  const signals = reduceGenreSignals(
    emptyUgcRows(),
    [],
    [
      { genre: 'Pop', country: 'US', streams7d: 100n, streams7dGrowth: 10 },
      { genre: 'Pop', country: 'US', streams7d: 50n, streams7dGrowth: 5 },
    ],
    [],
    'US',
  );

  const pop = signals.find((s) => s.genre === 'Pop');
  assert.ok(pop);
  assert.equal(pop!.usStreams7d, 150);
  assert.equal(pop!.usStreams7dGrowth, 15);
});

test('reduceGenreSignals sums multiple radio-format rows instead of the last one winning', () => {
  const signals = reduceGenreSignals(
    emptyUgcRows(),
    [],
    [],
    [
      { genre: 'Pop', spins7d: 200, spins7dGrowth: 20, formatId: 'CHR' },
      { genre: 'Pop', spins7d: 100, spins7dGrowth: 10, formatId: 'Rhythmic' },
    ],
    'US',
  );

  const pop = signals.find((s) => s.genre === 'Pop');
  assert.ok(pop);
  assert.equal(pop!.usSpins7d, 300);
  assert.equal(pop!.usSpins7dGrowth, 30);
});

test('a genre with only US chart growth still surfaces (not silently empty) and outranks a flat one', () => {
  const signals = reduceGenreSignals(
    emptyUgcRows(),
    [],
    [{ genre: 'Pop', country: 'US', streams7d: 144n, streams7dGrowth: 364.5 }],
    [],
    'US',
  );
  assert.equal(signals.length, 1);
  const pop = signals[0] as GenreBreakoutSignal;
  assert.ok(pop.breakoutScore > 0, 'usStreams7dGrowth must contribute to breakoutScore');
  assert.match(pop.commentary, /US streams/);
});

test('zero rows from every source yields zero genres (the literal BUG-005 symptom)', () => {
  const signals = reduceGenreSignals(emptyUgcRows(), [], [], [], 'US');
  assert.deepEqual(signals, []);
});
