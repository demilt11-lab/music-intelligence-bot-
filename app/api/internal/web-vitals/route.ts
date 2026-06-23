// app/api/internal/web-vitals/route.ts
//
// Receives Core Web Vitals beacons from the client and logs them in a
// structured line so they can be scraped/forwarded to an analytics sink.
// Intentionally unauthenticated (telemetry beacons fire before/without a
// session) and strictly validated to avoid log spam.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const KNOWN_METRICS = new Set(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB', 'Next.js-hydration'])

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: unknown
      value?: unknown
      rating?: unknown
      path?: unknown
    } | null

    if (
      body &&
      typeof body.name === 'string' &&
      KNOWN_METRICS.has(body.name) &&
      typeof body.value === 'number' &&
      Number.isFinite(body.value)
    ) {
      const rating = typeof body.rating === 'string' ? body.rating : 'n/a'
      const path = typeof body.path === 'string' ? body.path.slice(0, 200) : ''
      console.log(
        `[web-vitals] ${body.name}=${Math.round(body.value)} rating=${rating} path=${path}`,
      )
    }
  } catch {
    /* ignore malformed beacons */
  }

  return NextResponse.json({ ok: true })
}
