'use client'

import React, { useEffect, useState } from 'react'
import { SkeletonBox } from '@/components/ui/Skeleton'
import { formatNumber } from '@/lib/utils'

type AirplayTotals = {
  totalSpins?: number
}

type BroadcastMarket = {
  marketName: string
  spins: number
}

type RadioData = {
  airplayTotals?: AirplayTotals
  broadcastMarkets?: BroadcastMarket[]
}

type Props = {
  trackId: string
}

export function RadioClient({ trackId }: Props) {
  const [data, setData] = useState<RadioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/v1/tracks/${trackId}/radio`)
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || 'Failed to load radio data')
        }

        const json = await res.json()
        if (!cancelled) {
          setData(json.obj ?? null)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading radio data')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [trackId])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Radio Airplay
      </h2>

      {loading && (
        <div className="space-y-2">
          <SkeletonBox className="h-4 w-32" />
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBox key={i} className="h-3 w-full" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {!loading && !error && !data && (
        <p className="text-xs text-slate-500">No radio data available.</p>
      )}

      {!loading && !error && data && (
        <div className="space-y-3">
          {data.airplayTotals && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Total spins:</span>
              <span className="tabular-nums text-sm font-semibold text-slate-100">
                {data.airplayTotals.totalSpins != null
                  ? formatNumber(data.airplayTotals.totalSpins)
                  : '—'}
              </span>
            </div>
          )}

          {data.broadcastMarkets && data.broadcastMarkets.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                By Market
              </p>
              <ul className="space-y-1.5">
                {data.broadcastMarkets.map((m, idx) => (
                  <li key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{m.marketName}</span>
                    <span className="tabular-nums font-medium text-slate-200">
                      {formatNumber(m.spins)} spins
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No broadcast market breakdown available.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
