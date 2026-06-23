// app/api/talent-scout/genres/markets/route.ts

import { NextResponse } from 'next/server'
import { ScoutGenres } from '@/lib/engine'

export const dynamic = 'force-dynamic'

/**
 * Lists the markets that have genre data available, for the Genre Breakout
 * Radar region dropdown. Always degrades to at least ['US'] so the control is
 * never empty.
 */
export async function GET() {
  try {
    const markets = await ScoutGenres.getGenreMarkets()
    return NextResponse.json({ obj: markets.length ? markets : ['US'] })
  } catch (err) {
    console.error('[talent-scout-genres-markets]', err)
    return NextResponse.json({ obj: ['US'] })
  }
}
