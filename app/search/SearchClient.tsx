'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import { safeDisplayName } from '@/lib/shared/text'

type SearchType =
  | 'all'
  | 'artists'
  | 'tracks'
  | 'playlists'
  | 'curators'
  | 'albums'
  | 'stations'
  | 'songwriters'

type SearchResultBuckets = {
  artists?: any[]
  tracks?: any[]
  playlists?: any[]
  curators?: any[]
  albums?: any[]
  stations?: any[]
  songwriters?: any[]
}

const TYPES: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artists', label: 'Artists' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'playlists', label: 'Playlists' },
  { value: 'curators', label: 'Curators' },
  { value: 'albums', label: 'Albums' },
  { value: 'stations', label: 'Stations' },
  { value: 'songwriters', label: 'Songwriters' },
]

const BUCKET_ORDER: (keyof SearchResultBuckets)[] = [
  'tracks',
  'artists',
  'playlists',
  'curators',
  'albums',
  'stations',
  'songwriters',
]

function bucketLabel(k: string) {
  return k.charAt(0).toUpperCase() + k.slice(1)
}

function bucketIcon(bucket: string) {
  switch (bucket) {
    case 'tracks':
      return '♫'
    case 'artists':
      return '♪'
    case 'playlists':
      return '▤'
    case 'curators':
      return '✦'
    case 'albums':
      return '◫'
    case 'stations':
      return '◉'
    case 'songwriters':
      return '✎'
    default:
      return '◎'
  }
}

function getHref(bucket: string, item: any) {
  if (bucket === 'artists' && item.id) return `/artists/${item.id}`
  if (bucket === 'tracks' && item.id) return `/tracks/${item.id}`
  return null
}

function ResultRow({ item, bucket }: { item: any; bucket: string }) {
  // Last-resort render guard: even if a corrupt row reaches the client, never
  // paint raw markdown/URL fragments as a name. Server normalisation already
  // sanitises these, but other surfaces feed this component too.
  const fallback = bucket === 'artists' ? 'Unknown Artist' : '—'
  const rawName = item.name ?? item.title ?? item.id ?? '—'
  const name = safeDisplayName(rawName, fallback)
  const sub =
    bucket === 'tracks'
      ? item.artists
          ?.map((a: any) => safeDisplayName(a.name, 'Unknown Artist'))
          .join(', ')
      : item.description ?? item.genre ?? null
  const href = getHref(bucket, item)

  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 transition-colors last:border-0 hover:bg-white/[0.03]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm text-zinc-300">
        {bucketIcon(bucket)}
      </div>

      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate text-sm font-medium text-zinc-100 transition-colors hover:text-emerald-300"
          >
            {name}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium text-zinc-100">
            {name}
          </span>
        )}

        {sub && (
          <p className="truncate text-xs text-zinc-500">
            {sub}
          </p>
        )}
      </div>

      {item.score != null && (
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium tabular-nums text-zinc-400">
          {Number(item.score).toFixed(2)}
        </span>
      )}
    </div>
  )
}

export default function SearchClient({
  initialQuery = '',
}: {
  initialQuery?: string
}) {
  const [q, setQ] = useState(initialQuery)
  const [type, setType] = useState<SearchType>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SearchResultBuckets | null>(null)
  const [searched, setSearched] = useState(false)

  const runSearch = React.useCallback(
    async (query: string, searchType: SearchType) => {
      if (!query.trim()) return

      setLoading(true)
      setError(null)
      setSearched(true)

      try {
        const params = new URLSearchParams({ q: query, type: searchType })
        const res = await fetch(`/api/search?${params}`)

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || `Search failed (${res.status})`)
        }

        const data = await res.json()
        setResult(data.obj)
      } catch (err: any) {
        setError(err.message ?? 'Unknown error')
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Deep links (e.g. the home-page command bar) land here with ?q= set.
  React.useEffect(() => {
    if (initialQuery.trim()) void runSearch(initialQuery, 'all')
  }, [initialQuery, runSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await runSearch(q, type)
  }

  const totalResults = useMemo(() => {
    return result
      ? Object.values(result).reduce((n, bucket) => n + (bucket?.length ?? 0), 0)
      : 0
  }, [result])

  const resultBuckets = useMemo(() => {
    if (!result) return []
    return BUCKET_ORDER.filter((k) => (result[k]?.length ?? 0) > 0)
  }, [result])

  return (
    <PageShell
      title="Search"
      description="Search across artists, tracks, playlists, curators, albums, stations, and songwriters from one Buddy-powered discovery surface."
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
                      Discovery search
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                        Buddy can search the full music intelligence graph
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                        Find artists, tracks, playlists, curators, albums, stations, and songwriters from one fast discovery surface.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Query
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">
                        {q.trim() ? q : '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                        Type
                      </p>
                      <p className="mt-1 text-sm font-semibold text-cyan-300">
                        {TYPES.find((t) => t.value === type)?.label ?? 'All'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                        Results
                      </p>
                      <p className="mt-1 text-sm font-semibold text-emerald-300">
                        {searched && !loading ? totalResults : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Artist name, track, playlist, or paste a Spotify / YouTube URL…"
                    className="h-11 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                    aria-label="Search query"
                  />

                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as SearchType)}
                    className="h-11 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-zinc-200 outline-none transition focus:border-cyan-400/30 focus:bg-white/10"
                    aria-label="Search type"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={loading || !q.trim()}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 px-5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? 'Searching…' : 'Search'}
                  </button>
                </form>

                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <CompanionMessage
                    type="insight"
                    message={
                      loading
                        ? 'I’m searching across artists, tracks, playlists, curators, and other catalog entities now.'
                        : searched && totalResults === 0
                        ? `Nothing matched "${q}". Try a different spelling, broader keyword, or paste a direct URL.`
                        : searched
                        ? `I found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${q}". Review the grouped buckets below and open the strongest match.`
                        : 'Use search when you already know the entity you want to inspect, validate, or route into deeper analysis.'
                    }
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-6">
              {loading && (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 rounded-2xl border border-white/10 bg-white/[0.04] shimmer"
                    />
                  ))}
                </div>
              )}

              {error && !loading && (
                <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
                  <CompanionMessage type="warning" message={error} />
                </div>
              )}

              {!loading && !error && searched && totalResults === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                    ⌕
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">
                      No results for “{q}”
                    </p>
                    <p className="max-w-md text-sm leading-6 text-zinc-500">
                      Try a broader keyword, different spelling, or paste a direct Spotify or YouTube URL.
                    </p>
                  </div>
                </div>
              )}

              {!loading && !error && result && totalResults > 0 && (
                <div className="space-y-4">
                  {resultBuckets.map((bucket) => (
                    <section key={bucket}>
                      <div className="mb-2 flex items-center justify-between px-1">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                          {bucketLabel(bucket)}
                        </h3>
                        <span className="text-[11px] text-zinc-600">
                          {result[bucket]!.length}
                        </span>
                      </div>

                      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.82),rgba(10,10,11,0.94))]">
                        {result[bucket]!.map((item, i) => (
                          <ResultRow key={item.id ?? i} item={item} bucket={bucket} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {!searched && !loading && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-3xl text-zinc-600">
                    ⌕
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">
                      Start with a name, title, or URL
                    </p>
                    <p className="max-w-md text-sm leading-6 text-zinc-500">
                      Search is best for jumping directly into artist, track, playlist, curator, or catalog-level intelligence.
                    </p>
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
                  Use search when you know the entity you want and need to jump quickly into its intelligence page or grouped result bucket.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Tip</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Direct URLs and exact titles usually return the fastest path to the right record.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Search workflow
            </p>

            <div className="mt-4 space-y-3">
              {[
                'Enter a title, artist, or URL',
                'Select a search scope if needed',
                'Review grouped result buckets',
                'Open the strongest entity match',
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
