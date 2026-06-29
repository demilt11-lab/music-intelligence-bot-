'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { WatchlistGrid, type WatchlistEntry } from '@/components/watchlist/WatchlistGrid'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNeedsAuth(false)

    try {
      const res = await fetch('/api/ui/watchlist')

      if (res.status === 401) {
        setNeedsAuth(true)
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Watchlist request failed (${res.status})`)
      }

      const { obj } = await res.json()
      setItems(obj)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleRemove(id: number) {
    setActionError(null)
    const previous = items
    setItems((prev) => prev.filter((i) => i.id !== id))

    try {
      const res = await fetch(`/api/ui/watchlist/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        throw new Error(`Remove failed (${res.status})`)
      }
    } catch (e: any) {
      setItems(previous)
      setActionError(e.message ?? 'Could not remove the item — please retry.')
    }
  }

  async function handleExport() {
    setActionError(null)
    try {
      const res = await fetch('/api/ui/watchlist/export')
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'watchlist-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setActionError(e.message ?? 'Export failed — please retry.')
    }
  }

  const summary = useMemo(() => {
    return {
      total: items.length,
      artists: items.filter((item) => item.entityType === 'artist').length,
      tracks: items.filter((item) => item.entityType === 'track').length,
    }
  }, [items])

  return (
    <PageShell
      title="Watchlist"
      description="Keep a live shortlist of artists and records that deserve continued A&R attention, with fast removal and export built into the workflow."
      actions={
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          aria-label="Export watchlist as CSV"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(10,10,11,0.96))] shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="border-b border-white/10 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                      Live shortlist
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                        Buddy is tracking your active targets
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                        Use this list as your operating shortlist for follow-up, review, and export
                        across artist and track opportunities that matter most right now.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Total
                      </p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {loading ? '—' : summary.total}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                        Artists
                      </p>
                      <p className="mt-1 text-lg font-semibold text-cyan-300">
                        {loading ? '—' : summary.artists}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                        Tracks
                      </p>
                      <p className="mt-1 text-lg font-semibold text-amber-300">
                        {loading ? '—' : summary.tracks}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <CompanionMessage
                    type="insight"
                    message={
                      loading
                        ? ‘I’m pulling your current watchlist now.’
                        : needsAuth
                          ? ‘Sign in to view and manage your watchlist.’
                          : items.length === 0
                            ? ‘Your shortlist is empty right now. Add artists or tracks from scout and intelligence views to build a live decision queue.’
                            : `You currently have ${items.length} watchlist item${items.length !== 1 ? ‘s’ : ‘’}. This list works best as a focused operating queue rather than a long archive.`
                    }
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-6">
              {loading && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-28 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(10,10,11,0.96))] shimmer"
                    />
                  ))}
                </div>
              )}

              {needsAuth && !loading && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-2xl text-emerald-400">
                    ◈
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">Sign in to view your watchlist</p>
                    <p className="max-w-md text-sm leading-6 text-zinc-500">
                      Your watchlist is private to your account. Sign in to access your saved artists and tracks.
                    </p>
                  </div>
                  <a
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    Sign in
                  </a>
                </div>
              )}

              {error && !loading && !needsAuth && (
                <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
                  <CompanionMessage type="warning" message={error} />
                </div>
              )}

              {actionError && !loading && (
                <div className="mb-4 rounded-[22px] border border-amber-500/20 bg-amber-500/10 p-4">
                  <CompanionMessage type="warning" message={actionError} />
                </div>
              )}

              {!loading && !error && items.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                    ◎
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">No watchlist items yet</p>
                    <p className="max-w-md text-sm leading-6 text-zinc-500">
                      Build your shortlist by saving promising artists and tracks from Buddy Scout,
                      artist pages, and track intelligence views.
                    </p>
                  </div>
                </div>
              )}

              {!loading && !error && items.length > 0 && (
                <WatchlistGrid items={items} onRemove={handleRemove} />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Buddy read
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Purpose</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Use the watchlist as your live A&R queue for names that require continued
                  monitoring, team review, or export into external workflows.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Best practice</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Keep this list tight. The best watchlists are decision-focused, not archival.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Workflow
            </p>
            <div className="mt-4 space-y-3">
              {[
                'Save promising artists and tracks',
                'Review the shortlist daily',
                'Remove low-priority names quickly',
                'Export active targets when needed',
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-zinc-300">{step}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
