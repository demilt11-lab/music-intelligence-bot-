'use client'

import React, { useMemo, useState } from 'react'
import { cn, formatNumber } from '@/lib/utils'
import { SkeletonBox } from '@/components/ui/Skeleton'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type Playlist = {
  id: number
  name: string
  curatorName?: string
  platform?: string
  trackCount?: number
  followerCount?: number
}

type SearchResponse = {
  obj: {
    playlists?: Playlist[]
  }
}

const PLATFORM_ICON: Record<string, string> = {
  spotify: '♪',
  tiktok: '♬',
  youtube: '▶',
  apple: '♫',
}

const PLATFORM_STYLE: Record<string, string> = {
  spotify: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  tiktok: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
  youtube: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
  apple: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
}

export default function PlaylistsClient() {
  const [q, setQ] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [searched, setSearched] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inputValue.trim()) return

    setQ(inputValue)
    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const params = new URLSearchParams({ q: inputValue, type: 'playlists' })
      const res = await fetch(`/api/search?${params.toString()}`)

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Search failed')
      }

      const data = (await res.json()) as SearchResponse
      setPlaylists(data.obj.playlists ?? [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setPlaylists([])
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const totalFollowers = playlists.reduce((sum, p) => sum + (p.followerCount ?? 0), 0)
    const totalTracks = playlists.reduce((sum, p) => sum + (p.trackCount ?? 0), 0)
    const spotifyCount = playlists.filter(
      (p) => p.platform?.toLowerCase() === 'spotify'
    ).length

    return {
      totalFollowers,
      totalTracks,
      spotifyCount,
    }
  }, [playlists])

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
                    Playlist discovery
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                      Buddy is mapping playlist and curator surfaces
                    </h2>
                    <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                      Search playlist ecosystems, discover curator-adjacent opportunities, and gauge list size, density, and platform footprint before outreach or campaign planning.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Results
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {searched && !loading ? playlists.length : '—'}
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
                      Spotify Lists
                    </p>
                    <p className="mt-1 text-sm font-semibold text-cyan-300">
                      {searched && !loading ? summary.spotifyCount : '—'}
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
                    htmlFor="playlists-q"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500"
                  >
                    Playlist search
                  </label>
                  <input
                    id="playlists-q"
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Playlist name, curator, or Spotify/YouTube URL…"
                    className="h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                  />
                  <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">
                    Search by playlist name or curator, or paste a link. Supported links:
                    Spotify (<span className="text-zinc-400">open.spotify.com/playlist/…</span>)
                    and YouTube. A pasted link resolves only if that playlist is in our index.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center self-end rounded-full border border-cyan-400/20 bg-cyan-500/10 px-5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {loading ? 'Searching…' : 'Search playlists'}
                </button>
              </form>

              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <CompanionMessage
                  type="insight"
                  message={
                    loading
                      ? 'I’m searching playlist entities and curator-adjacent results now.'
                      : searched && playlists.length === 0
                      ? `No playlists matched "${q}". Try a broader keyword, curator name, or paste a direct playlist URL.`
                      : searched
                      ? `I found ${playlists.length} playlist${playlists.length !== 1 ? 's' : ''} for "${q}". Review platform, curator name, list size, and follower scale before deciding where to focus.`
                      : 'Use playlist search to identify list ecosystems, curator fingerprints, and potential route-to-audience opportunities.'
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
                    <SkeletonBox className="h-5 w-3/4" />
                    <SkeletonBox className="h-4 w-1/2" />
                    <SkeletonBox className="h-4 w-24" />
                    <SkeletonBox className="h-12 w-full rounded-2xl" />
                  </div>
                ))}
              </div>
            )}

            {error && !loading && (
              <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
                <CompanionMessage type="warning" message={error} />
              </div>
            )}

            {!loading && !error && searched && playlists.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                  ▤
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-200">
                    No playlists found for “{q}”
                  </p>
                  <p className="text-sm text-zinc-500">
                    Try another query or paste a direct playlist URL.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && playlists.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  {playlists.length} playlists found
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {playlists.map((p) => {
                    const platformKey = p.platform?.toLowerCase() ?? ''
                    const icon = PLATFORM_ICON[platformKey] ?? '♪'
                    const platformTone =
                      PLATFORM_STYLE[platformKey] ??
                      'border-white/10 bg-white/5 text-zinc-300'

                    return (
                      <article
                        key={p.id}
                        className={cn(
                          'group rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)] p-4',
                          'transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/20 hover:shadow-[0_18px_40px_rgba(0,0,0,0.18)]'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                            <span className="text-sm text-cyan-300" aria-hidden>
                              {icon}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-zinc-100">
                              {p.name}
                            </h3>

                            {p.curatorName && (
                              <p className="mt-1 truncate text-xs text-zinc-400">
                                {p.curatorName}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {p.platform && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${platformTone}`}
                            >
                              {p.platform}
                            </span>
                          )}

                          {p.trackCount != null && (
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-400">
                              {p.trackCount} tracks
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Followers
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">
                              {p.followerCount != null ? formatNumber(p.followerCount) : '—'}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Density
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-100">
                              {p.trackCount != null
                                ? p.trackCount <= 30
                                  ? 'Tight'
                                  : p.trackCount <= 80
                                  ? 'Balanced'
                                  : 'Broad'
                                : '—'}
                            </p>
                          </div>
                        </div>

                        <p className="mt-4 text-xs leading-5 text-zinc-500">
                          Review curator identity, platform fit, and follower scale before using this playlist as a campaign priority.
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
                Use playlist search to validate list relevance, curator identity, and audience scale before outreach or pitching decisions.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-zinc-400">A&R lens</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                Smaller, more focused playlists can matter as much as large lists when they align tightly with genre, behavior, or emerging audience clusters.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium text-zinc-400">Track volume scanned</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">
                {searched && !loading ? formatNumber(summary.totalTracks) : '—'}
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
              'Search a playlist or curator',
              'Review platform and follower scale',
              'Assess list density and fit',
              'Use strongest lists for outreach planning',
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
