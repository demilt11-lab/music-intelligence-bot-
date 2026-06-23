import { NextRequest, NextResponse } from 'next/server'
import { ScoutSources, ScoutScore } from '@/lib/engine'
import { Cache, TTL } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const VALID_MODES = new Set(['ugc_early', 'general'])

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') ?? undefined
    const code2 = (searchParams.get('code2') ?? 'GLOBAL').toUpperCase()
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit') ?? '50') || 50, 1),
      100,
    )
    const modeParam = searchParams.get('mode') ?? 'ugc_early'
    const mode = (VALID_MODES.has(modeParam) ? modeParam : 'ugc_early') as
      | 'ugc_early'
      | 'general'
    const debug = searchParams.get('debug') === '1'

    // Scout scans are identical for every viewer of the same lens — cache
    // the assembled response briefly to keep repeat loads instant.
    const cacheKey = `scout:daily:${date ?? 'latest'}:${code2}:${mode}:${limit}`
    if (!debug) {
      const cached = Cache.get<object>(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'x-cache': 'hit' },
        })
      }
    }

    let tracks: ScoutSources.TalentScoutTrack[] = []
    let sourceError: string | undefined

    try {
      tracks = await ScoutSources.fetchTopTiktokBreakoutTracks({ date, code2, limit })
    } catch (err) {
      sourceError = err instanceof Error ? err.message : String(err)
      console.error('[talent-scout-daily] source fetch failed:', sourceError)
    }

    tracks = await ScoutSources.hydrateInternalStreaming(tracks)
    tracks = await ScoutSources.hydrateLuminateMetrics(tracks)
    tracks = await ScoutSources.hydrateMlSignals(tracks, date)

    const ranked = ScoutScore.rankTalentTracks(tracks, mode)

    // Provenance of this batch: every tier returns a homogeneous source.
    const dataSource = ranked[0]?.source ?? null

    // Honesty gate: a batch only counts as a live signal if its source is a
    // signal source AND the rows actually resolved to real tracks. Otherwise
    // we'd render blank "Unknown" cards while claiming they are signal-backed
    // (the exact failure QA reported). Surface the resolution outcome instead.
    const resolvedCount = ranked.filter(
      (t) => t.name && t.name !== ScoutSources.UNRESOLVED_TRACK_NAME,
    ).length
    const nameResolutionRatio = ranked.length ? resolvedCount / ranked.length : 1
    const namesResolved = nameResolutionRatio >= 0.5
    const sourceIsSignal =
      dataSource != null && ScoutSources.SIGNAL_SOURCES.has(dataSource)
    const isSignalBacked = sourceIsSignal && namesResolved

    let dataQualityWarning: string | undefined
    if (sourceIsSignal && !namesResolved) {
      dataQualityWarning =
        'Scout signals were found but could not be matched to known tracks (track ID resolution failure), so they are not shown as live signals. Check ingestion/ETL ID mapping.'
      console.error(
        `[talent-scout-daily] name-resolution failure code2=${code2} mode=${mode} ` +
          `resolved=${resolvedCount}/${ranked.length} dataSource=${dataSource}`,
      )
    }

    // DB table counts are diagnostics — only pay for them when asked.
    let dbCounts: Record<string, number> | undefined
    if (debug) {
      const { db } = await import('@/lib/db')
      const [trackCount, chartRowCount, scoreCount, ugcCount] = await Promise.all([
        db.track.count(),
        db.chartRow.count(),
        db.talentScoutScore.count(),
        db.ugcTrackMetrics.count(),
      ])
      dbCounts = {
        tracks: trackCount,
        chartRows: chartRowCount,
        scores: scoreCount,
        ugcMetrics: ugcCount,
      }
    }

    const payload = {
      obj: ranked,
      meta: {
        date,
        code2,
        limit,
        mode,
        dataSource,
        isSignalBacked,
        rankedCount: ranked.length,
        resolvedCount,
        unresolvedCount: ranked.length - resolvedCount,
        ...(dataQualityWarning ? { dataQualityWarning } : {}),
        ...(sourceError ? { sourceError } : {}),
        ...(dbCounts ? { dbCounts } : {}),
        description:
          'Daily UGC trend-spotting list combining internal ML, UGC, streaming, and Luminate metrics.',
      },
    }

    // Don't cache transient failures, empty fallbacks, or unresolved batches —
    // caching a broken batch would freeze the failure until the TTL expires.
    if (!debug && !sourceError && ranked.length > 0 && namesResolved) {
      Cache.set(cacheKey, payload, TTL.SHORT)
    }

    return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } })
  } catch (err) {
    console.error('[talent-scout-daily]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
