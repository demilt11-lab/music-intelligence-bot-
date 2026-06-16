// lib/talentScout/sources.ts
import { db } from '@/lib/db'
import { safeDisplayName, sanitizeNameForStorage } from '@/lib/shared/text'

/**
 * Provenance of a scout result batch. The UI and API surface this so
 * fallback data is never presented as a live breakout signal:
 *  - ugc_live:        TikTok UGC momentum (the real early-breakout signal)
 *  - ml_scores:       ETL/ML viral scores (signal-backed)
 *  - charts:          chart appearances (established popularity, not breakout)
 *  - spotify_popular: live Spotify popularity (catalog context only)
 *  - sample:          explicitly-enabled demo placeholder (never a signal)
 */
export type ScoutDataSource =
  | 'ugc_live'
  | 'ml_scores'
  | 'charts'
  | 'spotify_popular'
  | 'sample'

/** Sources that represent real forward-looking breakout signals. */
export const SIGNAL_SOURCES: ReadonlySet<ScoutDataSource> = new Set([
  'ugc_live',
  'ml_scores',
])

export type TalentScoutTrack = {
  trackId: number
  name: string
  artists: string[]
  code2: string | null
  source: ScoutDataSource
  tiktokScore: number
  tiktokViews: string
  tiktokLikes: string
  tiktokVelocity: number
  spotifyStreamsLatest: string | null
  spotifyPopularity: number | null
  luminateStreamsLatest: string | null
  luminateAudienceLatest: string | null
  luminateSpinsLatest: string | null
  youtubeViews: string | null
  instagramPlays: string | null
  viralScore: number | null
  rightsComplexityScore: number | null
}

export async function fetchTopTiktokBreakoutTracks(opts: {
  date?: string
  code2?: string
  limit?: number
}): Promise<TalentScoutTrack[]> {
  const limit = opts.limit ?? 50
  const code2 = opts.code2 ?? 'GLOBAL'
  const dateFilter = opts.date ? { lte: new Date(opts.date) } : undefined

  console.log(
    `[scout-sources] fetchTopTiktokBreakoutTracks code2=${code2} limit=${limit} date=${opts.date ?? 'latest'}`
  )

  // ── Tier 1: UGC metrics (TikTok API data) ──
  const resolvedCode2 =
    code2 === 'GLOBAL'
      ? 'GLOBAL'
      : (
          await db.ugcTrackMetrics.findFirst({
            where: { code2, ...(dateFilter ? { date: dateFilter } : {}) },
            select: { code2: true },
          })
        )?.code2 ?? 'GLOBAL'

  const latestUgc = await db.ugcTrackMetrics.findFirst({
    where: { code2: resolvedCode2, ...(dateFilter ? { date: dateFilter } : {}) },
    orderBy: { date: 'desc' },
    select: { date: true },
  })

  console.log(`[scout-sources] Tier1 latestUgc=${latestUgc?.date ?? 'null'}`)

  if (latestUgc) {
    const ugcRows = await db.ugcTrackMetrics.findMany({
      where: { date: latestUgc.date, code2: resolvedCode2, views7d: { gt: 0 } },
      orderBy: { views7d: 'desc' },
      take: limit,
    })

    if (ugcRows.length) {
      const trackById = await loadTrackMeta(ugcRows.map((r) => r.trackId))

      return ugcRows.map((ugc, i) => {
        const info = trackById.get(ugc.trackId)

        return {
          trackId: ugc.trackId,
          name: info?.name ?? 'Unknown',
          artists: info?.artists ?? [],
          code2: code2 === 'GLOBAL' ? null : code2,
          source: 'ugc_live' as const,
          tiktokScore: computeTiktokScore({
            rank: i + 1,
            views: String(ugc.views7d),
            velocity: ugc.views7dGrowth,
          }),
          tiktokViews: String(ugc.views7d),
          tiktokLikes: '0',
          tiktokVelocity: ugc.views7dGrowth,
          spotifyStreamsLatest: null,
          spotifyPopularity: null,
          luminateStreamsLatest: null,
          luminateAudienceLatest: null,
          luminateSpinsLatest: null,
          youtubeViews: null,
          instagramPlays: null,
          viralScore: null,
          rightsComplexityScore: null,
        }
      })
    }
  }

  // ── Tier 2: talent_scout_scores from ETL ──
  console.log('[scout-sources] Tier1 empty, trying Tier2 (talentScoutScore)...')

  const scoreCode2 = code2 === 'GLOBAL' ? 'GLOBAL' : code2

  const latestScore = await db.talentScoutScore.findFirst({
    where: {
      code2: { in: [scoreCode2, 'GLOBAL'] },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'desc' },
    select: { date: true, code2: true },
  })

  console.log(
    `[scout-sources] Tier2 latestScore=${latestScore?.date ?? 'null'} code2=${latestScore?.code2 ?? 'null'}`
  )

  if (latestScore) {
    const scoreRows = await db.talentScoutScore.findMany({
      where: { date: latestScore.date, code2: latestScore.code2 },
      orderBy: { viralScore: 'desc' },
      take: limit,
    })

    if (scoreRows.length) {
      const trackById = await loadTrackMeta(scoreRows.map((r) => r.trackId))

      return scoreRows.map((s, i) => {
        const info = trackById.get(s.trackId)

        return {
          trackId: s.trackId,
          name: info?.name ?? 'Unknown',
          artists: info?.artists ?? [],
          code2: latestScore.code2 === 'GLOBAL' ? null : latestScore.code2,
          source: 'ml_scores' as const,
          tiktokScore: s.viralScore * Math.max(0, 1 - i / scoreRows.length),
          tiktokViews: '0',
          tiktokLikes: '0',
          tiktokVelocity: 0,
          spotifyStreamsLatest: null,
          spotifyPopularity: null,
          luminateStreamsLatest: null,
          luminateAudienceLatest: null,
          luminateSpinsLatest: null,
          youtubeViews: null,
          instagramPlays: null,
          viralScore: s.viralScore,
          rightsComplexityScore: s.rightsComplexityScore,
        }
      })
    }
  }

  // ── Tier 3: raw chart_rows from any ingested platform ──
  console.log('[scout-sources] Tier2 empty, trying Tier3 (chart_rows)...')

  const chartTracks = await db.$queryRaw<
    { trackId: number; rank: number; countryCode: string | null }[]
  >`
    SELECT DISTINCT ON (cr."trackId")
      cr."trackId",
      cr.rank,
      cs."countryCode"
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs.platform IN ('spotify', 'billboard', 'shazam')
    ORDER BY cr."trackId", cs."snapshotDate" DESC, cr.rank ASC
    LIMIT ${limit}
  `

  console.log(`[scout-sources] Tier3 chartTracks.length=${chartTracks.length}`)

  if (chartTracks.length) {
    const trackById = await loadTrackMeta(chartTracks.map((r) => r.trackId))

    return chartTracks.map((r) => {
      const info = trackById.get(r.trackId)

      return {
        trackId: r.trackId,
        name: info?.name ?? 'Unknown',
        artists: info?.artists ?? [],
        code2: r.countryCode,
        source: 'charts' as const,
        tiktokScore: Math.max(0, 1 - r.rank / 100),
        tiktokViews: '0',
        tiktokLikes: '0',
        tiktokVelocity: 0,
        spotifyStreamsLatest: null,
        spotifyPopularity: null,
        luminateStreamsLatest: null,
        luminateAudienceLatest: null,
        luminateSpinsLatest: null,
        youtubeViews: null,
        instagramPlays: null,
        viralScore: null,
        rightsComplexityScore: null,
      }
    })
  }

  // ── Tier 4 (optional, off by default): sample placeholder rows ──
  //
  // The previous behavior here live-searched Spotify for global superstars
  // and fabricated momentum scores for them, which presented established
  // catalog as "breakout discoveries". With no real signal available the
  // honest answer is an empty list (the UI explains why). Set
  // SCOUT_SAMPLE_FALLBACK=1 to instead return clearly-labeled sample rows
  // (source='sample', negative track IDs) for layout/demo walkthroughs.
  if (process.env.SCOUT_SAMPLE_FALLBACK === '1') {
    console.log('[scout-sources] No signal data — returning labeled sample rows')
    return SAMPLE_TRACKS.slice(0, limit).map((t, i) => ({
      trackId: -(i + 1),
      name: t.name,
      artists: t.artists,
      code2: code2 === 'GLOBAL' ? null : code2,
      source: 'sample' as const,
      tiktokScore: 0,
      tiktokViews: '0',
      tiktokLikes: '0',
      tiktokVelocity: 0,
      spotifyStreamsLatest: null,
      spotifyPopularity: null,
      luminateStreamsLatest: null,
      luminateAudienceLatest: null,
      luminateSpinsLatest: null,
      youtubeViews: null,
      instagramPlays: null,
      viralScore: null,
      rightsComplexityScore: null,
    }))
  }

  console.log('[scout-sources] No signal data available — returning empty set')
  return []
}

const SAMPLE_TRACKS: Array<{ name: string; artists: string[] }> = [
  { name: 'Sample Track A', artists: ['Demo Artist One'] },
  { name: 'Sample Track B', artists: ['Demo Artist Two'] },
  { name: 'Sample Track C', artists: ['Demo Artist Three'] },
  { name: 'Sample Track D', artists: ['Demo Artist Four'] },
  { name: 'Sample Track E', artists: ['Demo Artist Five'] },
]

async function loadTrackMeta(trackIds: number[]) {
  if (!trackIds.length) return new Map<number, { name: string; artists: string[] }>()

  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    include: { trackArtists: { include: { artist: true } } },
  })

  // Some rows leaked raw scraper markdown (image embeds, "Twitter](url)" share
  // fragments, bare URLs, stray backslashes) into the title/name. Sanitise here
  // — the single chokepoint feeding every scout source — so contaminated values
  // never reach the ranker, NOTE template, or track cards (see BUG-003).
  return new Map(
    tracks.map((t) => [
      t.id,
      {
        name: safeDisplayName(t.title, 'Untitled track'),
        artists: t.trackArtists
          .map((ta) => sanitizeNameForStorage(ta.artist.name))
          .filter((name): name is string => name != null),
      },
    ])
  )
}

function computeTiktokScore(row: {
  rank: number | null
  velocity: number | null
  views: string | null
}) {
  const rankComponent = row.rank ? 1 / row.rank : 0
  const velocityComponent = Math.min(row.velocity ?? 0, 5) / 5
  const viewsComponent =
    Number(row.views ?? 0) > 0 ? Math.log10(Number(row.views)) / 10 : 0

  return rankComponent * 0.5 + velocityComponent * 0.3 + viewsComponent * 0.2
}

export async function hydrateInternalStreaming(
  tracks: TalentScoutTrack[]
): Promise<TalentScoutTrack[]> {
  const trackIds = tracks.map((t) => t.trackId).filter((id) => id > 0)
  if (!trackIds.length) return tracks

  const statsRows = await db.trackStatisticsLatest.findMany({
    where: { trackId: { in: trackIds } },
    select: { trackId: true, youtubeViews: true },
  })

  const youtubeByTrack = new Map<number, string>()
  for (const r of statsRows) {
    if (r.youtubeViews != null) youtubeByTrack.set(r.trackId, String(r.youtubeViews))
  }

  const instagramRows = await db.trackPlatformStatsDaily.groupBy({
    by: ['trackId'],
    where: { platform: 'instagram', trackId: { in: trackIds } },
    _sum: { videoViews: true },
  })

  const instagramByTrack = new Map<number, string>()
  for (const r of instagramRows) {
    if (r._sum.videoViews != null) {
      instagramByTrack.set(r.trackId, String(r._sum.videoViews))
    }
  }

  return tracks.map((t) => ({
    ...t,
    youtubeViews: youtubeByTrack.get(t.trackId) ?? t.youtubeViews,
    instagramPlays: instagramByTrack.get(t.trackId) ?? t.instagramPlays,
  }))
}

export async function hydrateLuminateMetrics(
  tracks: TalentScoutTrack[]
): Promise<TalentScoutTrack[]> {
  const trackIds = tracks.map((t) => t.trackId).filter((id) => id > 0)
  if (!trackIds.length) return tracks

  const luminateStreams = await db.luminateStream.groupBy({
    by: ['entityId'],
    where: { entityType: 'track', entityId: { in: trackIds } },
    _max: { date: true },
  })

  const latestByTrack = new Map<number, Date>()
  luminateStreams.forEach((g) => {
    if (g._max.date) latestByTrack.set(g.entityId, g._max.date)
  })

  const streamRows = await db.luminateStream.findMany({
    where: { entityType: 'track', entityId: { in: trackIds } },
  })

  const latestStreamByTrack = new Map<number, string>()
  for (const r of streamRows) {
    const latest = latestByTrack.get(r.entityId)
    if (latest && r.date.getTime() === latest.getTime()) {
      latestStreamByTrack.set(r.entityId, r.streams)
    }
  }

  const airplayRows = await db.luminateAirplay.findMany({
    where: { entityType: 'track', entityId: { in: trackIds } },
    orderBy: [{ entityId: 'asc' }, { date: 'desc' }],
  })

  const latestAirplayByTrack = new Map<
    number,
    { date: Date; audience: string | null; spins: string | null }
  >()

  for (const r of airplayRows) {
    const prev = latestAirplayByTrack.get(r.entityId)

    if (!prev || r.date > prev.date) {
      latestAirplayByTrack.set(r.entityId, {
        date: r.date,
        audience: r.audience,
        spins: r.spins,
      })
    }
  }

  return tracks.map((t) => ({
    ...t,
    luminateStreamsLatest: latestStreamByTrack.get(t.trackId) ?? null,
    luminateAudienceLatest: latestAirplayByTrack.get(t.trackId)?.audience ?? null,
    luminateSpinsLatest: latestAirplayByTrack.get(t.trackId)?.spins ?? null,
  }))
}

export async function hydrateMlSignals(
  tracks: TalentScoutTrack[],
  date?: string
): Promise<TalentScoutTrack[]> {
  if (!tracks.length) return tracks

  const trackIds = tracks.map((t) => t.trackId).filter((id) => id > 0)
  if (!trackIds.length) return tracks

  const referenceDate = date ?? new Date().toISOString().slice(0, 10)
  const refDateStart = new Date(referenceDate)
  const refDateEnd = new Date(referenceDate)
  refDateEnd.setUTCDate(refDateEnd.getUTCDate() + 1)

  const mlRows = await db.talentScoutScore.findMany({
    where: {
      trackId: { in: trackIds },
      date: { gte: refDateStart, lt: refDateEnd },
    },
  })

  const byTrack = new Map<number, (typeof mlRows)[number]>()
  mlRows.forEach((r) => byTrack.set(r.trackId, r))

  return tracks.map((t) => {
    const m = byTrack.get(t.trackId)

    return {
      ...t,
      viralScore: m?.viralScore ?? t.viralScore,
      rightsComplexityScore: m?.rightsComplexityScore ?? t.rightsComplexityScore,
    }
  })
}
