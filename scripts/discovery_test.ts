// scripts/discovery_test.ts
//
// Runs the "songs to watch" discovery ranker (lib/talentScout/discovery.ts):
// surfaces songs ranked by month-over-month streaming growth + growth in
// curated-playlist features.
//
//   npx tsx scripts/discovery_test.ts            # synthetic demo pool
//   DATABASE_URL=... npx tsx scripts/discovery_test.ts   # live DB pool
//
// When DATABASE_URL is set the candidate pool is loaded from the real tables
// (track_platform_stats_daily + playlist_membership_events ⋈ curator_playlists),
// the 30/60-day windows are anchored on the latest available data date (so a
// slightly stale ingest still produces a meaningful "last month"), and a
// production data-coverage diagnostic is printed. Otherwise a clearly-labeled
// synthetic pool is used so the feature can be exercised without a database.

import {
  rankWatchCandidates,
  streamGrowthRate,
  type WatchCandidate,
  type RankedWatchCandidate,
} from '@/lib/talentScout/discovery'

const TOP_N = 10

/** Type of the shared Prisma client (imported dynamically only in DB mode). */
type DbClient = typeof import('@/lib/db').db

// ──────────────────────────────────────────────────────────────────────────
// Synthetic candidate pool (used when no DATABASE_URL is configured).
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

// ── live DB loading ──

type Diagnostics = {
  streamMin: string | null
  streamMax: string | null
  streamRows: number
  streamTracks: number
  eventMin: string | null
  eventMax: string | null
  eventTotal: number
  eventAdded: number
  curatorPlaylistLinks: number
  addedOnCurated: number
}

function fmtDate(d: unknown): string | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(String(d))
  return Number.isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10)
}

async function loadDiagnostics(db: DbClient): Promise<Diagnostics> {
  const [r] = await db.$queryRawUnsafe<any[]>(`
    SELECT
      (SELECT MIN(date) FROM track_platform_stats_daily)                        AS stream_min,
      (SELECT MAX(date) FROM track_platform_stats_daily)                        AS stream_max,
      (SELECT COUNT(*) FROM track_platform_stats_daily)                         AS stream_rows,
      (SELECT COUNT(DISTINCT "trackId") FROM track_platform_stats_daily)        AS stream_tracks,
      (SELECT MIN("eventDate") FROM playlist_membership_events)                 AS event_min,
      (SELECT MAX("eventDate") FROM playlist_membership_events)                 AS event_max,
      (SELECT COUNT(*) FROM playlist_membership_events)                         AS event_total,
      (SELECT COUNT(*) FROM playlist_membership_events WHERE "eventType"='added') AS event_added,
      (SELECT COUNT(*) FROM curator_playlists)                                  AS curator_playlist_links,
      (SELECT COUNT(*) FROM playlist_membership_events e
         JOIN curator_playlists cp ON cp."playlistId" = e."playlistId"
         WHERE e."eventType"='added')                                          AS added_on_curated
  `)
  return {
    streamMin: fmtDate(r.stream_min),
    streamMax: fmtDate(r.stream_max),
    streamRows: Number(r.stream_rows ?? 0),
    streamTracks: Number(r.stream_tracks ?? 0),
    eventMin: fmtDate(r.event_min),
    eventMax: fmtDate(r.event_max),
    eventTotal: Number(r.event_total ?? 0),
    eventAdded: Number(r.event_added ?? 0),
    curatorPlaylistLinks: Number(r.curator_playlist_links ?? 0),
    addedOnCurated: Number(r.added_on_curated ?? 0),
  }
}

/**
 * Load candidates from the live database. Windows are anchored on the latest
 * stream date present (not wall-clock today), so "last month" is meaningful
 * even when ingestion isn't current. Curated-playlist features use the same
 * anchor so the two signals describe the same calendar month.
 */
async function loadCandidatesFromDb(db: DbClient): Promise<WatchCandidate[]> {
  const ANCHOR = `(SELECT MAX(date) FROM track_platform_stats_daily)`

  const rows = await db.$queryRawUnsafe<any[]>(`
    WITH stream_windows AS (
      SELECT
        s."trackId",
        SUM(s.streams) FILTER (WHERE s.date >  ${ANCHOR} - INTERVAL '30 days') AS streams_last_30d,
        SUM(s.streams) FILTER (WHERE s.date <= ${ANCHOR} - INTERVAL '30 days'
                                 AND s.date >  ${ANCHOR} - INTERVAL '60 days') AS streams_prior_30d
      FROM track_platform_stats_daily s
      WHERE s.date > ${ANCHOR} - INTERVAL '60 days'
      GROUP BY s."trackId"
    ),
    curated_windows AS (
      SELECT
        e."trackId",
        COUNT(*) FILTER (WHERE e."eventDate" >  ${ANCHOR} - INTERVAL '30 days') AS curated_adds_last_30d,
        COUNT(*) FILTER (WHERE e."eventDate" <= ${ANCHOR} - INTERVAL '30 days'
                          AND e."eventDate" >  ${ANCHOR} - INTERVAL '60 days') AS curated_adds_prior_30d
      FROM playlist_membership_events e
      JOIN curator_playlists cp ON cp."playlistId" = e."playlistId"
      WHERE e."eventType" = 'added'
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
    artists: r.artists ? String(r.artists).split(', ') : [],
    streamsLast30d: Number(r.streams_last_30d ?? 0),
    streamsPrior30d: Number(r.streams_prior_30d ?? 0),
    curatedPlaylistAddsLast30d: Number(r.curated_adds_last_30d ?? 0),
    curatedPlaylistAddsPrior30d: Number(r.curated_adds_prior_30d ?? 0),
  }))
}

/** Tracks gaining curated-playlist features lately, anchored on the latest event date. */
async function loadTopCuratedPickups(
  db: DbClient,
): Promise<{ name: string; artists: string; last30: number; prior30: number }[]> {
  const ANCHOR = `(SELECT MAX("eventDate") FROM playlist_membership_events)`
  return db.$queryRawUnsafe<any[]>(`
    WITH cw AS (
      SELECT
        e."trackId",
        COUNT(*) FILTER (WHERE e."eventDate" >  ${ANCHOR} - INTERVAL '30 days') AS last30,
        COUNT(*) FILTER (WHERE e."eventDate" <= ${ANCHOR} - INTERVAL '30 days'
                          AND e."eventDate" >  ${ANCHOR} - INTERVAL '60 days') AS prior30
      FROM playlist_membership_events e
      JOIN curator_playlists cp ON cp."playlistId" = e."playlistId"
      WHERE e."eventType" = 'added'
      GROUP BY e."trackId"
    )
    SELECT t.title AS name, STRING_AGG(a.name, ', ') AS artists,
           cw.last30, cw.prior30
    FROM cw
    JOIN tracks t ON t.id = cw."trackId"
    LEFT JOIN track_artists ta ON ta."trackId" = t.id
    LEFT JOIN artists a ON a.id = ta."artistId"
    WHERE cw.last30 > cw.prior30
    GROUP BY t.title, cw.last30, cw.prior30
    ORDER BY (cw.last30 - cw.prior30) DESC
    LIMIT ${TOP_N}
  `).then((rows) =>
    rows.map((r) => ({
      name: r.name,
      artists: r.artists ?? '',
      last30: Number(r.last30 ?? 0),
      prior30: Number(r.prior30 ?? 0),
    })),
  )
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

function printDiagnostics(d: Diagnostics) {
  console.log('')
  console.log('  ── PRODUCTION DATA COVERAGE ──────────────────────────────────────────────')
  console.log(`  Streaming (track_platform_stats_daily): ${d.streamRows} rows, ${d.streamTracks} tracks`)
  console.log(`     date range: ${d.streamMin ?? 'n/a'} → ${d.streamMax ?? 'n/a'}`)
  console.log(`  Playlist membership events: ${d.eventTotal} total, ${d.eventAdded} 'added'`)
  console.log(`     date range: ${d.eventMin ?? 'n/a'} → ${d.eventMax ?? 'n/a'}`)
  console.log(`  Curator→playlist links (curator_playlists): ${d.curatorPlaylistLinks}`)
  console.log(`  'added' events on curator-backed playlists: ${d.addedOnCurated}`)
}

/** Minimum streaming history needed for a real prior-month comparison window. */
const MIN_STREAM_HISTORY_DAYS = 31

type Sufficiency = {
  streamingOk: boolean
  curatedOk: boolean
  streamSpanDays: number | null
  tracksWithPriorStreams: number
}

function daysBetween(min: string | null, max: string | null): number | null {
  if (!min || !max) return null
  const a = Date.parse(min)
  const b = Date.parse(max)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * Decide whether production has enough data to rank "songs to watch". The two
 * failure modes seen in practice:
 *   - streaming history shorter than a month → the prior-30d window is empty,
 *     so month-over-month "growth" degenerates to a clamped placeholder (+400%);
 *   - no curated-playlist data at all (no curator links / membership events).
 */
function assessSufficiency(diag: Diagnostics, candidates: WatchCandidate[]): Sufficiency {
  const streamSpanDays = daysBetween(diag.streamMin, diag.streamMax)
  const tracksWithPriorStreams = candidates.filter((c) => c.streamsPrior30d > 0).length
  const streamingOk =
    tracksWithPriorStreams > 0 && (streamSpanDays ?? 0) >= MIN_STREAM_HISTORY_DAYS
  const curatedOk = diag.curatorPlaylistLinks > 0 && diag.addedOnCurated > 0
  return { streamingOk, curatedOk, streamSpanDays, tracksWithPriorStreams }
}

function printInsufficient(diag: Diagnostics, suf: Sufficiency) {
  console.log('')
  console.log('═'.repeat(78))
  console.log('  ⚠  INSUFFICIENT PRODUCTION DATA — cannot rank "songs to watch"')
  console.log('═'.repeat(78))

  if (!suf.streamingOk) {
    const span = suf.streamSpanDays == null ? 'n/a' : `${suf.streamSpanDays} days`
    console.log('')
    console.log('  • Streaming growth (last 30d vs prior 30d): NOT COMPUTABLE')
    console.log(`      history spans only ${span} (${diag.streamMin ?? 'n/a'} → ${diag.streamMax ?? 'n/a'}), so the`)
    console.log('      prior-month window is empty — any "growth" would be a placeholder, not')
    console.log(`      a real change. Needs ≥ ~2 months of daily rows in track_platform_stats_daily.`)
  }
  if (!suf.curatedOk) {
    console.log('')
    console.log('  • Curated-playlist features: NO DATA')
    console.log(`      curator→playlist links: ${diag.curatorPlaylistLinks}, 'added' events on curated playlists: ${diag.addedOnCurated}.`)
    console.log('      Needs playlist_membership_events populated and curator_playlists links present.')
  }

  console.log('')
  console.log('  → Populate the ingestion/ETL for the signal(s) above, then re-run this workflow.')
  console.log('')
}

function printResults(ranked: RankedWatchCandidate[], poolSize: number, source: string) {
  console.log('')
  console.log('═'.repeat(78))
  console.log('  🎧  DISCOVERY — SONGS TO WATCH')
  console.log('  Criteria: ↑ streaming (last 30d vs prior 30d)  +  ↑ curated-playlist features')
  console.log(`  Data source: ${source}   |   Candidate pool: ${poolSize}   |   Qualified: ${ranked.length}`)
  console.log('═'.repeat(78))
  console.log('')

  if (!ranked.length) {
    console.log('  No song is currently trending up on BOTH signals at once.')
    console.log('  (See the per-signal movers below to find where momentum exists.)')
    return
  }

  console.log(
    pad('#', 3) + pad('SONG — ARTIST', 30) + pad('STREAMS (MoM)', 22) + pad('CURATED ADDS', 15) + 'WATCH',
  )
  console.log('─'.repeat(78))
  ranked.slice(0, TOP_N).forEach((t, i) => {
    const title = `${t.name} — ${t.artists.join(', ') || 'Unknown'}`
    const streams = `${count(t.streamsPrior30d)}→${count(t.streamsLast30d)} (${pct(t.streamGrowthRate)})`
    const adds = `${t.curatedPlaylistAddsPrior30d}→${t.curatedPlaylistAddsLast30d} (+${t.curatedPlaylistAddsDelta})`
    console.log(pad(String(i + 1), 3) + pad(title, 30) + pad(streams, 22) + pad(adds, 15) + t.watchScore.toFixed(2))
  })
}

function printStreamMovers(candidates: WatchCandidate[]) {
  const movers = candidates
    .filter((c) => c.streamsLast30d > c.streamsPrior30d)
    .map((c) => ({ ...c, rate: streamGrowthRate(c.streamsLast30d, c.streamsPrior30d) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, TOP_N)

  console.log('')
  console.log(`  ▲ TOP STREAM MOVERS (last 30d vs prior 30d) — ${movers.length} shown`)
  console.log('─'.repeat(78))
  if (!movers.length) {
    console.log('  (none — no track has higher streams in the last 30d than the prior 30d)')
    return
  }
  movers.forEach((m, i) => {
    const title = `${m.name} — ${m.artists.join(', ') || 'Unknown'}`
    console.log(`  ${pad(String(i + 1), 3)}${pad(title, 34)}${count(m.streamsPrior30d)}→${count(m.streamsLast30d)} (${pct(m.rate)})`)
  })
}

function printCuratedPickups(
  rows: { name: string; artists: string; last30: number; prior30: number }[],
) {
  console.log('')
  console.log(`  ★ TOP CURATED-PLAYLIST PICKUPS (last 30d vs prior 30d) — ${rows.length} shown`)
  console.log('─'.repeat(78))
  if (!rows.length) {
    console.log('  (none — no track gained curated-playlist features recently)')
    return
  }
  rows.forEach((r, i) => {
    const title = `${r.name} — ${r.artists || 'Unknown'}`
    console.log(`  ${pad(String(i + 1), 3)}${pad(title, 40)}${r.prior30}→${r.last30} (+${r.last30 - r.prior30})`)
  })
}

async function main() {
  const useDb = Boolean(process.env.DATABASE_URL)

  if (!useDb) {
    const ranked = rankWatchCandidates(SYNTHETIC_POOL)
    printResults(ranked, SYNTHETIC_POOL.length, 'SYNTHETIC demo pool (no DATABASE_URL)')
    return
  }

  const { db } = await import('@/lib/db')
  try {
    const diag = await loadDiagnostics(db)
    const pool = await loadCandidatesFromDb(db)

    printDiagnostics(diag)

    // Guard: if either signal lacks the data to be measured, report that
    // cleanly rather than printing placeholder rankings/movers.
    const suf = assessSufficiency(diag, pool)
    if (!suf.streamingOk || !suf.curatedOk) {
      printInsufficient(diag, suf)
      // Surface real per-signal movers only for signals that actually have data.
      if (suf.streamingOk) printStreamMovers(pool)
      if (suf.curatedOk) printCuratedPickups(await loadTopCuratedPickups(db))
      console.log('')
      return
    }

    const ranked = rankWatchCandidates(pool)
    printResults(ranked, pool.length, 'LIVE DB (track_platform_stats_daily + curated playlist events)')

    // When the strict "both signals up" list is thin, surface where momentum
    // actually exists on each individual signal — these are real songs too.
    if (ranked.length < TOP_N) {
      printStreamMovers(pool)
      printCuratedPickups(await loadTopCuratedPickups(db))
    }
    console.log('')
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
