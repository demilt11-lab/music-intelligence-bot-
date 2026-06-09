import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/shared/errors'
import { successResponse } from '@/lib/shared/response'

type RouteParams = {
  params: { id: string }
}

export async function GET(
  _req: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const id = Number(params.id)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
    }

    const totalSpins = await db.radioAirplayFact.count({
      where: { trackId: id },
    })

    const grouped = await db.radioAirplayFact.groupBy({
      by: ['countryCode'],
      where: { trackId: id },
      _count: { _all: true },
    })

    const broadcastMarkets = grouped
      .filter((g) => g._count._all > 0)
      .map((g) => ({
        marketName: g.countryCode ?? 'Unknown market',
        spins: g._count._all,
      }))
      .sort((a, b) => b.spins - a.spins)
      .slice(0, 20)

    const obj =
      totalSpins === 0 && broadcastMarkets.length === 0
        ? null
        : {
            airplayTotals: { totalSpins },
            broadcastMarkets,
          }

    return successResponse({ obj })
  } catch (err) {
    return handleApiError(err)
  }
}
