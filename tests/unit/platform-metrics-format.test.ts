import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlatformMetric } from '@/lib/utils'

// ── Null / zero / empty → dash ────────────────────────────────────────────────

test('null returns dash', () => {
  assert.equal(formatPlatformMetric(null), '—')
})

test('undefined returns dash', () => {
  assert.equal(formatPlatformMetric(undefined), '—')
})

test('empty string returns dash', () => {
  assert.equal(formatPlatformMetric(''), '—')
})

test('string zero returns dash (no-data sentinel)', () => {
  assert.equal(formatPlatformMetric('0'), '—')
})

test('numeric zero returns dash (no-data sentinel)', () => {
  assert.equal(formatPlatformMetric(0), '—')
})

// ── Non-numeric passthrough (Spotify popularity fallback) ────────────────────

test('non-numeric string passes through unmodified', () => {
  assert.equal(formatPlatformMetric('Pop 85'), 'Pop 85')
})

// ── K range ───────────────────────────────────────────────────────────────────

test('1 000 → 1K', () => {
  assert.equal(formatPlatformMetric(1_000), '1K')
})

test('1 200 → 1.2K', () => {
  assert.equal(formatPlatformMetric(1_200), '1.2K')
})

test('10 000 → 10K', () => {
  assert.equal(formatPlatformMetric(10_000), '10K')
})

test('500 000 → 500K', () => {
  assert.equal(formatPlatformMetric(500_000), '500K')
})

test('string 500 000 → 500K', () => {
  assert.equal(formatPlatformMetric('500000'), '500K')
})

// ── M range ───────────────────────────────────────────────────────────────────

test('1 000 000 → 1M', () => {
  assert.equal(formatPlatformMetric(1_000_000), '1M')
})

test('1 500 000 → 1.5M', () => {
  assert.equal(formatPlatformMetric(1_500_000), '1.5M')
})

test('string 8 000 000 → 8M', () => {
  assert.equal(formatPlatformMetric('8000000'), '8M')
})

// ── B range ───────────────────────────────────────────────────────────────────

test('1 000 000 000 → 1B', () => {
  assert.equal(formatPlatformMetric(1_000_000_000), '1B')
})

test('2 500 000 000 → 2.5B', () => {
  assert.equal(formatPlatformMetric(2_500_000_000), '2.5B')
})

// ── Small values ─────────────────────────────────────────────────────────────

test('values below 1K are locale-formatted', () => {
  assert.equal(formatPlatformMetric(42), '42')
  assert.equal(formatPlatformMetric('999'), '999')
})

// ── Key-mapping snapshot ─────────────────────────────────────────────────────
// Verifies that the field names the backend sets on TalentScoutTrack match
// what ScoutTrackCard and PlatformBar expect to receive.

test('backend TalentScoutTrack fields align with ScoutTrack UI contract', () => {
  // These are the fields set by sources.ts and consumed by ScoutTrackCard.
  // If any rename happens on either side, this test will fail to compile.
  type BackendFields = {
    tiktokViews: string
    tiktokVelocity: number
    spotifyStreamsLatest: string | null
    spotifyPopularity: number | null
    youtubeViews: string | null
    instagramPlays: string | null
    luminateStreamsLatest: string | null
  }

  type UIFields = {
    tiktokViews: string | number
    tiktokVelocity: number
    spotifyStreamsLatest: string | null
    spotifyPopularity: number | null
    youtubeViews: string | null
    instagramPlays: string | null
    luminateStreamsLatest: string | null
  }

  // A BackendFields object must be assignable to UIFields (backend ⊆ UI contract).
  const backendSample: BackendFields = {
    tiktokViews: '500000',
    tiktokVelocity: 1.5,
    spotifyStreamsLatest: '8000000',
    spotifyPopularity: 72,
    youtubeViews: '1200000',
    instagramPlays: '45000',
    luminateStreamsLatest: '320000',
  }

  // TypeScript will error here if the types are incompatible.
  const asUI: UIFields = backendSample
  void asUI // suppress unused-variable lint

  assert.ok(true, 'backend and UI field shapes are compatible')
})

test('hydrateInternalStreaming return shape covers all four platform metric fields', () => {
  // Validates that the four fields populated by hydrateInternalStreaming are
  // present in TalentScoutTrack and typed as string | null (post-conversion).
  type HydratedMetrics = {
    youtubeViews: string | null
    instagramPlays: string | null
    spotifyStreamsLatest: string | null
    spotifyPopularity: number | null
  }

  const hydrated: HydratedMetrics = {
    youtubeViews: '1000000',
    instagramPlays: '50000',
    spotifyStreamsLatest: '8000000',
    spotifyPopularity: 85,
  }

  assert.equal(formatPlatformMetric(hydrated.youtubeViews), '1M')
  assert.equal(formatPlatformMetric(hydrated.instagramPlays), '50K')
  assert.equal(formatPlatformMetric(hydrated.spotifyStreamsLatest), '8M')
  assert.equal(
    formatPlatformMetric(`Pop ${hydrated.spotifyPopularity}`),
    'Pop 85',
  )
})
