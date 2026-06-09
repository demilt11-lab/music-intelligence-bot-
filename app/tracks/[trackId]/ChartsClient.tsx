'use client'

import React, { useEffect, useState } from 'react'
import { SkeletonBox } from '@/components/ui/Skeleton'

type ChartEntry = {
  rank: number | null
  addedAt: string | null
  code2: string | null
  chartType: string
  peakRank: number | null
  peakDate: string | null
}

type ChartsResponse = {
  obj: {
    data: ChartEntry[]
    length: number
  }
}

type Props = {
  trackId: string
}

export function ChartsClient({ trackId }: Props) {
  const [data, setData] = useState<ChartEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/tracks/${trackId}/charts/spotify_top_daily`)
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || 'Failed to load charts')
        }

        const json: ChartsResponse = await res.json()

        if (!cancelled) {
          setData(json.obj?.data ?? [])
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading charts')
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
        Charts
      </h2>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBox key={i} className="h-4 w-full" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {!loading && !error && !data?.length && (
        <p className="text-xs text-slate-500">No chart history available.</p>
      )}

      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {data.map((entry, idx) => (
            <li key={idx} className="flex items-center gap-2 text-slate-300">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
              <span className="text-slate-400">{entry.chartType}</span>
              <span className="font-medium text-slate-200">
                {entry.rank != null ? `#${entry.rank}` : '—'}
              </span>
              <span className="text-slate-500">
                {entry.addedAt || entry.peakDate || '—'}
              </span>
              {entry.code2 && <span className="text-slate-600">({entry.code2})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
