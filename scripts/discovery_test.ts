// scripts/discovery_test.ts
//
// Runs the "songs to watch" discovery ranker (lib/talentScout/discovery.ts):
// surfaces 10 songs ranked by month-over-month streaming growth + growth in
// curated-playlist features.
//
//   npx tsx scripts/discovery_test.ts            # synthetic demo pool
//   DATABASE_URL=... npx tsx scripts/discovery_test.ts   # live DB pool
//
// When DATABASE_URL is set the candidate pool is loaded from the real tables
// (track_platform_stats_daily + playlist_membership_events ⋈ curator_playlists);
// otherwise a clearly-labeled synthetic pool is used so the feature can be
// exercised without a database.

import {
  rankWatchCandidates,
  type WatchCandidate,
  type RankedWatchCandidate,
} from '@/lib/talentScout/discovery'

const TOP_N = 10

// ──────────────────────────────────────────────────────────────────────────
// Synthetic candidate pool (used when no DATABASE_URL is configured).
// Numbers are illustrative. 12 candidates trend up on both signals; 2 are
// included to prove the qualifier filter (one with flat curated features, one
// with declining streams) and should NOT appear in the results.
// ──────────────────────────────────────────────────────────────────────────
const SYNTHETIC_POOL: WatchCandidate[] = [
  c(101, 'Neon Tide', ['Maris'], 1_100_000, 3_600_000, 4, 14),
  c(102, 'Paper Crowns', ['Sable Vaughn'], 480_000, 2_400_000, 2, 11),
  c(103, 'Slow Bloom', ['June Vale'], 720_000, 2_100_000, 1, 8),
  c(104, 'Glasshouse', ['KOA'], 2_000_000, 4_400_000, 6, 12),
  c(105, 'Midnight Errand', ['Caro Lima'], 90_000, 360_000, 1, 6),
  c(106, 'Cinnamon', ['The Florals'], 300_000, 980_000, 0, 5),
  c(107, 'Undertow', ['Bexley'], 1_500_000, 2_600_000, 5, 13),
  c(108, 'Ember Season', ['Tomas Hale'], 4_200_000, 6_000_000, 8, 17),
  c(109, 'Featherweight', ['Nyla Brooks'], 210_000, 520_000, 2, 7),
  c(110, 'Saltwater Hymn', ['Drift Coast'], 640_000, 1_200_000, 3, 8),
  c(111, 'Polaroid', ['Eunwoo'], 1_800_000, 2_300_000, 7, 9),
  c(112, 'Brass & Bone', ['The Owls'], 95_000, 150_000, 1, 2),
  // Non-qualifiers (should be filtered out):
  c(113, 'Comet', ['VHS'], 5_000_000, 9_000_000, 6, 6), // streams up, curated features flat
  c(114, 'Static Bloom', ['Pale Hours'], 2_200_000, 1_700_000, 2, 9), // curated up, streams down
]

function c(
  trackId: number,
  name: string,
  artists: string[],
  streamsPrior30d: number,
  streamsLast30d: number,
  curatedPlaylistAddsPrior30d: number,
  curatedPlaylistAddsLast30d: number,
): WatchCandidate {
  return {
    trackId,
    name,
    artists,
    streamsLast30d,
    streamsPrior30d,
    curatedPlaylistAddsLast30d,
    curatedPlaylistAddsPrior30d,
  }
}

/**
 * Load candidates from the live database. Maps the two signals to real tables:
 *   - streaming windows  → track_platform_stats_daily.streams
 *   - curated features   → playlist_membership_events ⋈ curator_playlists
 * Only invoked when DATABASE_URL is set.
 */
async function loadCandidatesFromDb(): Promise<WatchCandidate[]> {
  const { db } = await import('@/lib/db')

  const rows = await db.$queryRawUnsafe<
    {
      trackId: number
      name: string
      artists: string | null
      streams_last_30d: bigint | null
      streams_prior_30d: bigint | null
      curated_adds_last_30d: bigint | null
      curated_adds_prior_30d: bigint | null
    }[]
  >(`
    WITH stream_windows AS (
      SELECT
        s."trackId",
        SUM(s.streams) FILTER (WHERE s.date >= CURRENT_DATE - INTERVAL '30 days')                                       AS streams_last_30d,
        SUM(s.streams) FILTER (WHERE s.date >= CURRENT_DATE - INTERVAL '60 days' AND s.date < CURRENT_DATE - INTERVAL '30 days') AS streams_prior_30d
      FROM track_platform_stats_daily s
      WHERE s.date >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY s."trackId"
    ),
    curated_windows AS (
      SELECT
        e."trackId",
        COUNT(*) FILTER (WHERE e."eventDate" >= CURRENT_DATE - INTERVAL '30 days')                                        AS curated_adds_last_30d,
        COUNT(*) FILTER (WHERE e."eventDate" >= CURRENT_DATE - INTERVAL '60 days' AND e."eventDate" < CURRENT_DATE - INTERVAL '30 days') AS curated_adds_prior_30d
      FROM playlist_membership_events e
      JOIN curator_playlists cp ON cp."playlistId" = e."playlistId"
      WHERE e."eventType" = 'added'
        AND e."eventDate" >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY e."trackId"
    )
    SELECT
      t.id AS "trackId",
      t.title AS name,
      STRING_AGG(a.name, ', ') AS artists,
      sw.streams_last_30d,
      sw.streams_prior_30d,
      cw.curated_adds_last_30d,
      cw.curated_adds_prior_30d
    FROM tracks t
    JOIN stream_windows sw ON sw."trackId" = t.id
    LEFT JOIN curated_windows cw ON cw."trackId" = t.id
    LEFT JOIN track_artists ta ON ta."trackId" = t.id
    LEFT JOIN artists a ON a.id = ta."artistId"
    GROUP BY t.id, t.title, sw.streams_last_30d, sw.streams_prior_30d,
             cw.curated_adds_last_30d, cw.curated_adds_prior_30d
  `)

  return rows.map((r) => ({
    trackId: r.trackId,
    name: r.name,
    artists: r.artists ? r.artists.split(', ') : [],
    streamsLast30d: Number(r.streams_last_30d ?? 0),
    streamsPrior30d: Number(r.streams_prior_30d ?? 0),
    curatedPlaylistAddsLast30d: Number(r.curated_adds_last_30d ?? 0),
    curatedPlaylistAddsPrior30d: Number(r.curated_adds_prior_30d ?? 0),
  }))
}

// ── presentation ──

function pct(rate: number): string {
  const v = Math.round(rate * 100)
  return `${v >= 0 ? '+' : ''}${v}%`
}

function count(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length)
}

function printResults(ranked: RankedWatchCandidate[], poolSize: number, source: string) {
  console.log('')
  console.log('═'.repeat(78))
  console.log('  🎧  DISCOVERY — SONGS TO WATCH')
  console.log('  Criteria: ↑ streaming (last 30d vs prior 30d)  +  ↑ curated-playlist features')
  console.log(`  Data source: ${source}   |   Candidate pool: ${poolSize}   |   Qualified: ${ranked.length}`)
  console.log('═'.repeat(78))
  console.log('')

  const header =
    pad('#', 3) +
    pad('SONG — ARTIST', 30) +
    pad('STREAMS (MoM)', 22) +
    pad('CURATED ADDS', 15) +
    'WATCH'
  console.log(header)
  console.log('─'.repeat(78))

  ranked.slice(0, TOP_N).forEach((t, i) => {
    const title = `${t.name} — ${t.artists.join(', ') || 'Unknown'}`
    const streams = `${count(t.streamsPrior30d)}→${count(t.streamsLast30d)} (${pct(t.streamGrowthRate)})`
    const adds = `${t.curatedPlaylistAddsPrior30d}→${t.curatedPlaylistAddsLast30d} (+${t.curatedPlaylistAddsDelta})`
    const score = t.watchScore.toFixed(2)
    console.log(
      pad(String(i + 1), 3) +
        pad(title, 30) +
        pad(streams, 22) +
        pad(adds, 15) +
        score,
    )
  })

  console.log('')
  console.log('  WHY THESE — top 3 in detail')
  console.log('─'.repeat(78))
  ranked.slice(0, 3).forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name} — ${t.artists.join(', ')}  (watch ${t.watchScore.toFixed(2)})`)
    t.reasons.forEach((r) => console.log(`       • ${r}`))
  })
  console.log('')
}

async function main() {
  const useDb = Boolean(process.env.DATABASE_URL)
  let pool: WatchCandidate[]
  let source: string

  if (useDb) {
    try {
      pool = await loadCandidatesFromDb()
      source = 'LIVE DB (track_platform_stats_daily + curated playlist events)'
      if (!pool.length) {
        console.warn('[discovery_test] DB returned no candidates — falling back to synthetic pool')
        pool = SYNTHETIC_POOL
        source = 'SYNTHETIC (DB empty)'
      }
    } catch (err) {
      console.warn(`[discovery_test] DB load failed (${(err as Error).message}) — using synthetic pool`)
      pool = SYNTHETIC_POOL
      source = 'SYNTHETIC (DB load failed)'
    }
  } else {
    pool = SYNTHETIC_POOL
    source = 'SYNTHETIC demo pool (no DATABASE_URL)'
  }

  const ranked = rankWatchCandidates(pool)
  printResults(ranked, pool.length, source)

  if (useDb) {
    const { db } = await import('@/lib/db')
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
