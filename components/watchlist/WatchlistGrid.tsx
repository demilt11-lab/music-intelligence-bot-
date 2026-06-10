'use client'

import React from 'react'
import Link from 'next/link'

export interface WatchlistEntry {
  id: number
  entityType: string
  entityId: number
  entityName: string | null
  artistNames: string[]
  addedAt: string
  viralScore: number | null
  viralScoreDelta: number | null
  trendLabel: string | null
}

interface WatchlistGridProps {
  items: WatchlistEntry[]
  onRemove: (id: number) => void
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null

  const pct = (delta * 100).toFixed(1)
  const positive = delta >= 0

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums',
        positive
          ? 'bg-emerald-500/12 text-emerald-300'
          : 'bg-rose-500/12 text-rose-300',
      ].join(' ')}
    >
      {positive ? '+' : ''}
      {pct}%
    </span>
  )
}

function TrendBadge({ trendLabel }: { trendLabel: string | null }) {
  if (!trendLabel) return null

  const styles =
    trendLabel === 'VIRAL'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-300'
      : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles}`}
    >
      {trendLabel}
    </span>
  )
}

function getEntityIcon(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('artist')) return '♪'
  if (normalized.includes('track')) return '♫'
  return '◎'
}

function getEntityHref(item: WatchlistEntry) {
  const normalized = item.entityType.toLowerCase()
  if (normalized.includes('artist')) return `/artists/${item.entityId}`
  if (normalized.includes('track')) return `/tracks/${item.entityId}`
  return undefined
}

function formatAddedDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function scoreTone(score: number | null) {
  if (score == null) return 'text-zinc-400'
  if (score >= 0.7) return 'text-emerald-300'
  if (score >= 0.4) return 'text-amber-300'
  return 'text-zinc-200'
}

export function WatchlistGrid({ items, onRemove }: WatchlistGridProps) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
          ◎
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-200">Your watchlist is empty</p>
          <p className="max-w-md text-sm leading-6 text-zinc-500">
            Save artists and tracks from Buddy Scout or intelligence pages to build a
            focused shortlist here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const href = getEntityHref(item)
        const scorePercent =
          item.viralScore != null ? `${Math.round(item.viralScore * 100)}` : '—'

        return (
          <article
            key={item.id}
            className="group overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-1 hover:border-white/15"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm text-zinc-300">
                {getEntityIcon(item.entityType)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    {item.entityType}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500">
                    #{item.entityId}
                  </span>
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-white">
                  {item.entityName || `Untitled ${item.entityType}`}
                </p>
                {item.artistNames.length > 0 && (
                  <p className="truncate text-xs text-zinc-400">
                    {item.artistNames.join(', ')}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Added
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-200">
                      {formatAddedDate(item.addedAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Viral score
                    </p>
                    <p
                      className={`mt-1 text-lg font-semibold tabular-nums ${scoreTone(item.viralScore)}`}
                    >
                      {scorePercent}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label="Remove from watchlist"
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-500 transition hover:border-rose-400/20 hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <DeltaBadge delta={item.viralScoreDelta} />
              <TrendBadge trendLabel={item.trendLabel} />
              {item.viralScore != null && (
                <span className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-500/8 px-2 py-1 text-[10px] font-medium text-emerald-200/90">
                  Score {(item.viralScore * 100).toFixed(1)}
                </span>
              )}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-200 transition-all duration-700"
                style={{
                  width: `${item.viralScore != null ? Math.max(6, item.viralScore * 100) : 6}%`,
                  opacity: item.viralScore != null ? 0.95 : 0.35,
                  boxShadow: '0 0 18px rgba(52, 211, 153, 0.22)',
                }}
                aria-hidden
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-zinc-500">
                Shortlisted for continued monitoring and fast revisit.
              </p>

              {href ? (
                <Link
                  href={href}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-emerald-400/20 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  Open
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-500">
                  Saved
                </span>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

WatchlistGrid.displayName = 'WatchlistGrid'

export default WatchlistGrid
