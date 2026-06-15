'use server'

import { NextResponse } from 'next/server'
import { buildRightsProfile } from '@/lib/rights/registry'

type RouteParams = { params: Promise<{ trackId: string }> }

export const revalidate = 3600 // cache for 1 hour — PRO/MLC data changes slowly

export async function GET(_req: Request, props: RouteParams) {
  const { trackId: raw } = await props.params
  const trackId = Number(raw)
  if (!trackId || Number.isNaN(trackId)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }

  try {
    const profile = await buildRightsProfile(trackId)
    return NextResponse.json({ obj: profile })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
