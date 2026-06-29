import { NextRequest, NextResponse } from 'next/server'
import { Cache, TTL } from '@/lib/cache'
import {
  generateScoutBrief,
  type ScoutBriefInput,
  type ScoutBriefTrack,
} from '@/lib/ai/scoutBrief'
import { isAiConfigured } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_MODES = new Set(['ugc_early', 'general'])
const MAX_TRACKS = 5

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

/** Stable cache signature so identical scans reuse one generated brief. */
function briefCacheKey(input: ScoutBriefInput): string {
  const sig = input.topTracks
    .map((t) => `${t.name}~${Math.round(t.score * 100)}`)
    .join('|')
  return `ai:scout-brief:${input.market}:${input.mode}:${input.isSignalBacked ? 1 : 0}:${sig}`
}

export async function POST(req: NextRequest) {
  try {
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

    const cacheKey = briefCacheKey(input)
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
    console.error('[ai/scout-brief]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
