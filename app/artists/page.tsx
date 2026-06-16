'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type BreakingArtist = {
  artistId: string
  name: string | null
  code2: string | null
  primaryGenre: string | null
  primaryCode2: string | null
  status: string
  statusScore: number
  breakProbability: number | null
  modelBreakProbability?: number | null
  breakProbabilitySource?: 'model' | 'heuristic'
  streams28dDelta: number
  playlistsDelta28d: number | null
  followersDelta28d: number | null
}

type BreakingResponse = {
  obj: BreakingArtist[]
  offset: number
  total: number
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    badge: string
    dot: string
    summary: string
  }
> = {
  ABOUT_TO_BREAK: {
    label: 'About to break',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    dot: 'bg-amber-400',
    summary:
      'Highest-priority artists showing breakout probability and near-term momentum.',
  },
  GROWING: {
    label: 'Growing',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    dot: 'bg-emerald-400',
    summary:
      'Artists with positive movement that may be ready for deeper scouting review.',
  },
  STABLE: {
    label: 'Stable',
    badge: 'bg-white/5 text-zinc-300 border-white/10',
    dot: 'bg-zinc-400',
    summary:
      'Artists maintaining their current position without major acceleration or decline.',
  },
  DECLINING: {
    label: 'Declining',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    dot: 'bg-rose-400',
    summary:
      'Artists losing momentum and requiring caution before allocation or outreach.',
  },
}

const FILTER_STATUSES = ['ABOUT_TO_BREAK', 'GROWING', 'STABLE', 'DECLINING']

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  const pct = (v * 100).toFixed(1)
  return `${v > 0 ? '+' : ''}${pct}%`
}

function fmtProb(v: number | null) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function metricTone(v: number | null | undefined) {
  const value = v ?? 0
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-rose-300'
  return 'text-zinc-400'
}

export default function ArtistsDashboardPage() {
  const [status, setStatus] = useState('ABOUT_TO_BREAK')
  const [genre, setGenre] = useState('')
  const [code2, setCode2] = useState('')
  const [data, setData] = useState<BreakingArtist[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // Debounce the text filters and abort superseded requests so a slow
    // older response can never overwrite a newer one.
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (genre) params.set('genre', genre)
      if (code2) params.set('code2', code2)
      params.set('limit', '100')

      fetch(`/api/artists/breaking?${params}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null)
            throw new Error(body?.error ?? `Request failed (${r.status})`)
          }
          return r.json() as Promise<BreakingResponse>
        })
        .then((json) => {
          setData(json.obj)
          setTotal(json.total)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError(e instanceof Error ? e.message : 'Failed to load artists')
          setData([])
          setTotal(0)
          setLoading(false)
        })
    }, genre || code2 ? 300 : 0)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [status, genre, code2, refreshKey])

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.STABLE
  const hasSubFilters = Boolean(genre || code2)

  // Empty results mean different things depending on whether the user has
  // narrowed by genre/region. With no sub-filters applied, an empty status
  // cohort points at the data pipeline, not the filters — so don't tell the
  // user to "widen the lens" they never narrowed.
  const emptyMessage = hasSubFilters
    ? `No ${cfg.label.toLowerCase()} artists match the current genre/region filters. Clear them to see the full cohort.`
    : `No artists are currently classified as ${cfg.label.toLowerCase()}. If you expect results here, the artist-signals pipeline may not have completed a full run yet — check the latest run on the Analytics page.`

  const summary = useMemo(() => {
    const highBreak = data.filter((artist) => (artist.breakProbability ?? 0) >= 0.7).length
    const positiveMomentum = data.filter((artist) => artist.streams28dDelta > 0).length
    const playlistLift = data.filter((artist) => (artist.playlistsDelta28d ?? 0) > 0).length

    return {
      highBreak,
      positiveMomentum,
      playlistLift,
    }
  }, [data])

  return (
    <PageShell
      title="Artist Intelligence"
      description="Monitor artist momentum, isolate breakout candidates, and sort talent by growth stage, market movement, and probability of breaking."
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(10,10,11,0.96))] shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="border-b border-white/10 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                      <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                      Artist radar active
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                        Buddy is monitoring {cfg.label.toLowerCase()} artists
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                        {loading
                          ? 'Scanning artist trajectories across streaming, playlist, and audience growth signals.'
                          : total === 0
                            ? emptyMessage
                            : `Tracking ${total} artist${total !== 1 ? 's' : ''} in this cohort. ${cfg.summary}`}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[440px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Results
                      </p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {loading ? '—' : total}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                        High Break %
                      </p>
                      <p className="mt-1 text-lg font-semibold text-amber-300">
                        {loading ? '—' : summary.highBreak}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                        Positive Streams
                      </p>
                      <p className="mt-1 text-lg font-semibold text-emerald-300">
                        {loading ? '—' : summary.positiveMomentum}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                        Playlist Lift
                      </p>
                      <p className="mt-1 text-lg font-semibold text-cyan-300">
                        {loading ? '—' : summary.playlistLift}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    {FILTER_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        aria-pressed={status === s}
                        className={[
                          'rounded-full border px-3 py-2 text-xs font-medium transition',
                          status === s
                            ? 'border-emerald-400/20 bg-emerald-500 text-black shadow-[0_8px_24px_rgba(16,185,129,0.24)]'
                            : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/15 hover:bg-white/10 hover:text-white',
                        ].join(' ')}
                      >
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>

                  <input
                    className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                    placeholder="Genre filter"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    aria-label="Filter by genre"
                  />

                  <input
                    className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-sm uppercase text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                    placeholder="Region"
                    value={code2}
                    onChange={(e) => setCode2(e.target.value.toUpperCase())}
                    aria-label="Filter by region"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-6">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 rounded-2xl border border-white/10 bg-white/[0.04] shimmer"
                    />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-2xl text-rose-300">
                    !
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">
                      Artist data is unavailable right now
                    </p>
                    <p className="max-w-md text-sm text-zinc-500">{error}</p>
                  </div>
                  <button
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20"
                  >
                    Retry
                  </button>
                </div>
              ) : data.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                    ◈
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">
                      {hasSubFilters
                        ? `No ${cfg.label.toLowerCase()} artists match these filters`
                        : `No artists classified as ${cfg.label.toLowerCase()} yet`}
                    </p>
                    <p className="max-w-md text-sm text-zinc-500">{emptyMessage}</p>
                  </div>
                  {hasSubFilters ? (
                    <button
                      onClick={() => {
                        setGenre('')
                        setCode2('')
                      }}
                      className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.78),rgba(10,10,11,0.9))]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03]">
                          {[
                            'Artist',
                            'Status',
                            'Genre',
                            'Region',
                            'Break %',
                            'Streams 28d',
                            'Playlists 28d',
                            'Followers 28d',
                          ].map((h, i) => (
                            <th
                              key={h}
                              className={`px-4 py-3 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500 ${
                                i >= 4 ? 'text-right' : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {data.map((row) => {
                          const sc = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.STABLE

                          return (
                            <tr
                              key={row.artistId}
                              className="transition-colors hover:bg-white/[0.03]"
                            >
                              <td className="px-4 py-3">
                                {row.artistId ? (
                                  <Link
                                    href={`/artists/${row.artistId}`}
                                    className="font-medium text-zinc-100 transition-colors hover:text-emerald-300"
                                  >
                                    {row.name || 'Unknown Artist'}
                                  </Link>
                                ) : (
                                  <span className="text-zinc-400">
                                    {row.name || 'Unknown'}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${sc.badge}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {sc.label}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-zinc-400">
                                {row.primaryGenre || '—'}
                              </td>

                              <td className="px-4 py-3 text-zinc-400">
                                {row.primaryCode2 || row.code2 || '—'}
                              </td>

                              <td className="px-4 py-3 text-right mono-num text-zinc-200">
                                {row.breakProbabilitySource === 'model' &&
                                row.modelBreakProbability != null ? (
                                  fmtProb(row.modelBreakProbability)
                                ) : row.breakProbability != null ? (
                                  <span title="Heuristic estimate from momentum rules — no model output available yet">
                                    ~{fmtProb(row.breakProbability)}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>

                              <td
                                className={`px-4 py-3 text-right mono-num ${metricTone(
                                  row.streams28dDelta
                                )}`}
                              >
                                {fmt(row.streams28dDelta)}
                              </td>

                              <td
                                className={`px-4 py-3 text-right mono-num ${metricTone(
                                  row.playlistsDelta28d
                                )}`}
                              >
                                {fmt(row.playlistsDelta28d)}
                              </td>

                              <td
                                className={`px-4 py-3 text-right mono-num ${metricTone(
                                  row.followersDelta28d
                                )}`}
                              >
                                {fmt(row.followersDelta28d)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-zinc-500">
                    Break % marked with ~ is a heuristic estimate derived from
                    momentum rules; unmarked values come from the trained model.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Buddy read
            </p>

            <div className="mt-4">
              <CompanionMessage
                type="insight"
                message={
                  loading
                    ? 'I’m compiling the current artist movement picture now.'
                    : total === 0
                      ? 'No clear artist signals under the active filters. Open the lens to uncover more opportunities.'
                      : `This view is best for identifying ${cfg.label.toLowerCase()} talent and routing the strongest names into deeper artist, track, and playlist analysis.`
                }
              />
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Current status lens</p>
                <p className="mt-1 text-sm font-semibold text-white">{cfg.label}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Recommended move</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Review artists with rising break probability and positive stream or
                  playlist lift first, then branch into artist detail pages for closer
                  validation.
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
                'Filter by growth stage',
                'Check break probability',
                'Validate stream and playlist momentum',
                'Open artist detail for deeper scouting',
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 text-xs font-semibold text-cyan-300">
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
