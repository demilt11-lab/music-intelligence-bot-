import { NextRequest, NextResponse } from 'next/server'
import { Cache, TTL } from '@/lib/cache'
import {
  generateScoutBrief,
  type ScoutBriefInput,
  type ScoutBriefTrack,
} from '@/lib/ai/scoutBrief'
import { isAiConfigured } from '@/lib/ai/anthropic'
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard'
import { enforceKeyedRateLimit } from '@/lib/platform/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_MODES = new Set(['ugc_early', 'general'])
const MAX_TRACKS = 5
// Generous enough for legitimate UI polling (market/mode switches), tight
// enough that varying the payload per request can't drive unbounded spend.
const MAX_REQUESTS_PER_MINUTE = 20

function sanitizeTracks(raw: unknown): ScoutBriefTrack[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_TRACKS)
    .map((t) => {
      const obj = (t ?? {}) as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.slice(0, 200) : ''
      const artists = Array.isArray(obj.artists)
        ? obj.artists
            .filter((a): a is string => typeof a === 'string')
            .slice(0, 6)
            .map((a) => a.slice(0, 120))
        : []
      const scoreNum = Number(obj.score)
      const score = Number.isFinite(scoreNum) ? Math.max(0, Math.min(1, scoreNum)) : 0
      return { name, artists, score }
    })
    .filter((t) => t.name.length > 0)
}

/**
 * Stable cache signature so identical scans reuse one generated brief.
 * Scoped per-tenant so two tenants can never see each other's cached AI text.
 * Scores are bucketed to the nearest 5 points (not the exact percentage
 * point) so ordinary score drift between scans still hits the cache instead
 * of forcing a fresh model call on every near-identical request.
 */
function briefCacheKey(tenantId: number, input: ScoutBriefInput): string {
  const sig = input.topTracks
    .map((t) => `${t.name}~${Math.round((t.score * 100) / 5) * 5}`)
    .join('|')
  return `ai:scout-brief:tenant:${tenantId}:${input.market}:${input.mode}:${input.isSignalBacked ? 1 : 0}:${sig}`
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const user = await requireSession(req)
    await enforceKeyedRateLimit(
      `tenant:${user.tenantId}`,
      'ai:scout-brief',
      MAX_REQUESTS_PER_MINUTE,
    )

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const market = (typeof body.market === 'string' ? body.market : 'GLOBAL')
      .toUpperCase()
      .slice(0, 8)
    const modeParam = typeof body.mode === 'string' ? body.mode : 'ugc_early'
    const mode = (VALID_MODES.has(modeParam) ? modeParam : 'ugc_early') as
      | 'ugc_early'
      | 'general'
    const isSignalBacked = body.isSignalBacked === true
    const topTracks = sanitizeTracks(body.topTracks)

    const input: ScoutBriefInput = { market, mode, isSignalBacked, topTracks }

    const cacheKey = briefCacheKey(user.tenantId, input)
    const cached = Cache.get<object>(cacheKey)
    if (cached) {
      return NextResponse.json(cached, { headers: { 'x-cache': 'hit' } })
    }

    const brief = await generateScoutBrief(input)

    const payload = {
      obj: {
        brief: brief.text,
        source: brief.source,
        ...(brief.model ? { model: brief.model } : {}),
      },
      meta: { aiConfigured: isAiConfigured() },
    }

    // Cache AI briefs (worth reusing); skip caching heuristics so they refresh
    // immediately once a key is configured or signals arrive.
    if (brief.source === 'ai') {
      Cache.set(cacheKey, payload, TTL.MEDIUM)
    }

    return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if ((err as { status?: number })?.status === 429) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    console.error('[ai/scout-brief]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
