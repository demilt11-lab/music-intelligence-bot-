import { NextResponse } from 'next/server'
import { buildSongwriterRightsProfile } from '@/lib/rights/registry'

type RouteParams = { params: Promise<{ id: string }> }

export const revalidate = 3600

export async function GET(_req: Request, props: RouteParams) {
  const { id: raw } = await props.params
  const id = Number(raw)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'Invalid songwriter id' }, { status: 400 })
  }

  try {
    const profile = await buildSongwriterRightsProfile(id)
    return NextResponse.json({ obj: profile })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
