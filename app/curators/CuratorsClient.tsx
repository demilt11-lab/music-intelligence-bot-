'use client'

import React, { useMemo, useState } from 'react'
import { cn, formatNumber } from '@/lib/utils'
import { SkeletonBox } from '@/components/ui/Skeleton'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type Curator = {
  id: number
  name: string
  platform?: string
  followerCount?: number
  playlistCount?: number
}

type SearchResponse = {
  obj: {
    curators?: Curator[]
  }
}

const PLATFORM_STYLE: Record<string, string> = {
  spotify: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  tiktok: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
  youtube: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
  apple: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
}

const PLATFORM_ICON: Record<string, string> = {
  spotify: '♪',
  tiktok: '♬',
  youtube: '▶',
  apple: '♫',
}

export default function CuratorsClient() {
  const [inputValue, setInputValue] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [curators, setCurators] = useState<Curator[]>([])
  const [searched, setSearched] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inputValue.trim()) return

    setQ(inputValue)
    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const params = new URLSearchParams({ q: inputValue, type: 'curators' })
      const res = await fetch(`/api/search?${params.toString()}`)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Search failed')
      }

      const data = (await res.json()) as SearchResponse
      setCurators(data.obj.curators ?? [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setCurators([])
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const totalFollowers = curators.reduce((sum, curator) => sum + (curator.followerCount ?? 0), 0)
    const totalPlaylists = curators.reduce((sum, curator) => sum + (curator.playlistCount ?? 0), 0)
    const spotifyCount = curators.filter(
      (curator) => curator.platform?.toLowerCase() === 'spotify'
    ).length

    return {
      totalFollowers,
      totalPlaylists,
      spotifyCount,
    }
  }, [curators])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(10,10,11,0.96))] shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                    Curator discovery
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                      Buddy is mapping curator influence surfaces
                    </h2>
                    <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                      Search curator identities, compare audience scale, and understand how playlist ecosystems connect to editorial and discovery opportunities.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Results
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {searched && !loading ? curators.length : '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                      Followers
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {searched && !loading ? formatNumber(summary.totalFollowers) : '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                      Playlists
                    </p>
                    <p className="mt-1 text-sm font-semibold text-cyan-300">
                      {searched && !loading ? formatNumber(summary.totalPlaylists) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div>
                  <label
                    htmlFor="curators-q"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500"
                  >
                    Curator search
                  </label>
                  <input
                    id="curators-q"
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Curator name or URL…"
                    className="h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center self-end rounded-full border border-cyan-400/20 bg-cyan-500/10 px-5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {loading ? 'Searching…' : 'Search curators'}
                </button>
              </form>

              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <CompanionMessage
                  type="insight"
                  message={
                    loading
                      ? 'I’m searching curator entities and their surrounding playlist ecosystems now.'
                      : searched && curators.length === 0
                      ? `No curators matched "${q}". Try another query, a direct URL, or a broader name variant.`
                      : searched
                      ? `I found ${curators.length} curator${curators.length !== 1 ? 's' : ''} for "${q}". Review follower scale, platform fit, and playlist footprint before deciding who matters most.`
                      : 'Use curator search to identify editorial gatekeepers, assess playlist network scale, and narrow down the right outreach targets.'
                  }
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            {loading && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.94),rgba(10,10,11,0.98))] p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <SkeletonBox className="h-11 w-11 rounded-2xl" />
                      <div className="flex-1 space-y-2">
                        <SkeletonBox className="h-4 w-28" />
                        <SkeletonBox className="h-3 w-20" />
                      </div>
                    </div>
                    <SkeletonBox className="h-12 w-full rounded-2xl" />
                    <SkeletonBox className="h-3 w-24" />
                  </div>
                ))}
              </div>
            )}

            {error && !loading && (
              <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
                <CompanionMessage type="warning" message={error} />
              </div>
            )}

            {!loading && !error && searched && curators.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                  ✦
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-200">
                    No curators found for “{q}”
                  </p>
                  <p className="text-sm text-zinc-500">
                    Try another query or confirm spelling.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && curators.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  {curators.length} curators found
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {curators.map((curator) => {
                    const platformKey = curator.platform?.toLowerCase() ?? ''
                    const icon = PLATFORM_ICON[platformKey] ?? '✦'
                    const platformTone =
                      PLATFORM_STYLE[platformKey] ??
                      'border-white/10 bg-white/5 text-zinc-300'

                    const initials = curator.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase() ?? '')
                      .join('')

                    return (
                      <article
                        key={curator.id}
                        className={cn(
                          'group rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)] p-4',
                          'transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/20 hover:shadow-[0_18px_40px_rgba(0,0,0,0.18)]'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                            <span className="text-xs font-semibold text-cyan-300" aria-hidden>
                              {initials || icon}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-zinc-100">
                              {curator.name}
                            </h3>

                            {curator.platform && (
                              <div className="mt-2">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${platformTone}`}
                                >
                                  {curator.platform}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Followers
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">
                              {curator.followerCount != null
                                ? formatNumber(curator.followerCount)
                                : '—'}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Playlists
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">
                              {curator.playlistCount != null
                                ? formatNumber(curator.playlistCount)
                                : '—'}
                            </p>
                          </div>
                        </div>

                        <p className="mt-4 text-xs leading-5 text-zinc-500">
                          Validate platform fit, network scale, and playlist footprint before prioritizing this curator for outreach.
                        </p>
                      </article>
                    )
                  })}
                </div>
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

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-zinc-400">Best use case</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                Use curator search to identify editorial gatekeepers and understand which playlist networks could matter most for a campaign.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-zinc-400">A&R lens</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                The right curator is not always the largest one. Relevance, network quality, and repeatable fit often matter more than raw reach.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-zinc-400">Spotify curators</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {searched && !loading ? summary.spotifyCount : '—'}
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
              'Search a curator by name or URL',
              'Review platform and follower scale',
              'Check playlist footprint',
              'Shortlist high-fit curator targets',
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
  )
}
