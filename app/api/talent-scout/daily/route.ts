import { NextRequest, NextResponse } from 'next/server'
import { ScoutSources, ScoutScore } from '@/lib/engine'
import { Cache, TTL } from '@/lib/cache'
import { logger } from '@/lib/logger'
import { requireSession, AuthError } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const VALID_MODES = new Set(['ugc_early', 'general'])

export async function GET(req: NextRequest) {
  try {
    await requireSession(req);

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

    // Scout scans are identical for every viewer of the same lens — cache
    // the assembled response briefly to keep repeat loads instant.
    const cacheKey = `scout:daily:${date ?? 'latest'}:${code2}:${mode}:${limit}`
    const cached = Cache.get<object>(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'x-cache': 'hit' },
      })
    }

    let tracks: ScoutSources.TalentScoutTrack[] = []
    let sourceError: string | undefined

    try {
      tracks = await ScoutSources.fetchTopTiktokBreakoutTracks({ date, code2, limit })
    } catch (err) {
      sourceError = err instanceof Error ? err.message : String(err)
      logger.error('[talent-scout-daily] source fetch failed:', sourceError)
    }

    tracks = await ScoutSources.hydrateInternalStreaming(tracks)
    tracks = await ScoutSources.hydrateLuminateMetrics(tracks)
    tracks = await ScoutSources.hydrateMlSignals(tracks, date)

    const ranked = ScoutScore.rankTalentTracks(tracks, mode)

    // Provenance of this batch: every tier returns a homogeneous source.
    const dataSource = ranked[0]?.source ?? null
    const isSignalBacked =
      dataSource != null && ScoutSources.SIGNAL_SOURCES.has(dataSource)

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
        ...(sourceError ? { sourceError } : {}),
        description:
          'Daily UGC trend-spotting list combining internal ML, UGC, streaming, and Luminate metrics.',
      },
    }

    // Don't cache transient failures or empty fallback states.
    if (!sourceError && ranked.length > 0) {
      Cache.set(cacheKey, payload, TTL.SHORT)
    }

    return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    logger.error('[talent-scout-daily]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
