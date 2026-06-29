'use client'

import React, { useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import type {
  SearchArtistResult,
  SearchTrackResult,
  SearchPlaylistResult,
  SearchCuratorResult,
  SearchAlbumResult,
  SearchStationResult,
  SearchCityResult,
  SearchSongwriterResult,
} from '@/lib/search/types'

type SearchType =
  | 'all'
  | 'artists'
  | 'tracks'
  | 'playlists'
  | 'curators'
  | 'albums'
  | 'stations'
  | 'cities'
  | 'songwriters'

type SearchResultBuckets = {
  artists?: SearchArtistResult[]
  tracks?: SearchTrackResult[]
  playlists?: SearchPlaylistResult[]
  curators?: SearchCuratorResult[]
  albums?: SearchAlbumResult[]
  stations?: SearchStationResult[]
  cities?: SearchCityResult[]
  songwriters?: SearchSongwriterResult[]
}

const TYPES: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artists', label: 'Artists' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'playlists', label: 'Playlists' },
  { value: 'curators', label: 'Curators' },
  { value: 'albums', label: 'Albums' },
  { value: 'stations', label: 'Stations' },
  { value: 'cities', label: 'Cities' },
  { value: 'songwriters', label: 'Songwriters' },
]

const BUCKET_ORDER: (keyof SearchResultBuckets)[] = [
  'tracks',
  'artists',
  'playlists',
  'curators',
  'albums',
  'stations',
  'cities',
  'songwriters',
]

function bucketLabel(k: string) {
  return k.charAt(0).toUpperCase() + k.slice(1)
}

function bucketIcon(bucket: string) {
  switch (bucket) {
    case 'tracks': return '♫'
    case 'artists': return '♪'
    case 'playlists': return '▤'
    case 'curators': return '✦'
    case 'albums': return '◫'
    case 'stations': return '◉'
    case 'songwriters': return '✎'
    default: return '◎'
  }
}

function getHref(bucket: string, item: { id?: number | string | null }): string | null {
  if (bucket === 'artists' && item.id) return `/artists/${item.id}`
  if (bucket === 'tracks' && item.id) return `/tracks/${item.id}`
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSubtitle(bucket: string, item: any): string | null {
  switch (bucket) {
    case 'tracks': {
      const artists = item.artists as Array<{ name: string }> | undefined
      return artists?.map((a) => a.name).join(', ') ?? null
    }
    case 'artists': {
      const parts: string[] = []
      if (item.code2) parts.push(String(item.code2))
      if (item.spotifyFollowers != null)
        parts.push(`${Number(item.spotifyFollowers).toLocaleString()} followers`)
      return parts.join(' · ') || null
    }
    case 'playlists': {
      const parts: string[] = []
      if (item.platform) parts.push(String(item.platform))
      if (item.ownerName) parts.push(String(item.ownerName))
      if (item.followers) parts.push(`${Number(item.followers).toLocaleString()} followers`)
      return parts.join(' · ') || null
    }
    case 'curators': {
      const parts: string[] = []
      if (item.platform) parts.push(String(item.platform))
      if (item.numPlaylists != null) parts.push(`${item.numPlaylists} playlists`)
      return parts.join(' · ') || null
    }
    case 'albums': {
      const albumArtists = item.artists as Array<{ name: string }> | undefined
      const parts: string[] = []
      const artistStr = albumArtists?.map((a) => a.name).join(', ')
      if (artistStr) parts.push(artistStr)
      if (item.releaseDate) parts.push(String(item.releaseDate).slice(0, 4))
      return parts.join(' · ') || null
    }
    case 'stations': {
      return [item.genre, item.country].filter(Boolean).join(' · ') || null
    }
    case 'cities': {
      return [item.country, item.code2].filter(Boolean).join(' · ') || null
    }
    default:
      return null
  }
}

function WatchlistButton({
  entityType,
  entityId,
}: {
  entityType: 'artist' | 'track'
  entityId: number
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handleSave = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (status === 'saving' || status === 'saved') return
      setStatus('saving')
      try {
        const res = await fetch('/api/ui/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId }),
        })
        if (res.ok || res.status === 409) {
          setStatus('saved')
        } else {
          setStatus('error')
          setTimeout(() => setStatus('idle'), 2000)
        }
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2000)
      }
    },
    [entityType, entityId, status],
  )

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
        ✓ Saved
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={status === 'saving'}
      title="Save to watchlist"
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-emerald-400/20 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
    >
      {status === 'saving' ? '…' : '+ Watch'}
    </button>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultRow({ item, bucket }: { item: any; bucket: string }) {
  const name = String(item.name ?? item.title ?? item.id ?? '—')
  const sub = getSubtitle(bucket, item)
  const href = getHref(bucket, item)
  const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl : null
  const isWatchable = bucket === 'artists' || bucket === 'tracks'
  const entityType = bucket === 'artists' ? 'artist' : 'track'

  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 transition-colors last:border-0 hover:bg-white/[0.03]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-sm text-zinc-300">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          bucketIcon(bucket)
        )}
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

      <div className="flex shrink-0 items-center gap-2">
        {item.score != null && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium tabular-nums text-zinc-400">
            {Number(item.score).toFixed(0)}
          </span>
        )}
        {isWatchable && item.id && (
          <WatchlistButton entityType={entityType} entityId={Number(item.id)} />
        )}
      </div>
    </div>
  )
}

const EXAMPLE_QUERIES = [
  'Search by artist name',
  'Search by track title',
  'Paste a Spotify URL',
  'Search by playlist name',
]

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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

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
      description="Search across artists, tracks, playlists, curators, and more — or paste a Spotify, YouTube, or Apple Music URL to jump directly to an entity."
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
                        Search the music intelligence graph
                      </h2>
                      <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                        Find artists, tracks, playlists, curators, albums, and stations — or paste a direct Spotify / YouTube URL to resolve instantly.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Query</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">
                        {q.trim() ? q : '—'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Type</p>
                      <p className="mt-1 text-sm font-semibold text-cyan-300">
                        {TYPES.find((t) => t.value === type)?.label ?? 'All'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">Results</p>
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
                    className="h-11 rounded-full border border-white/10 bg-[#0a0d12] px-4 text-sm text-zinc-200 outline-none transition focus:border-cyan-400/30"
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
                        ? 'Searching across artists, tracks, playlists, curators, and other catalog entities now.'
                        : searched && totalResults === 0
                        ? `Nothing matched "${q}". Try a different spelling, broader keyword, or paste a direct URL.`
                        : searched
                        ? `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${q}". Review the grouped buckets and save promising artists to your watchlist.`
                        : 'Search by artist name, track title, playlist, or paste a Spotify / YouTube URL to jump directly to an entity.'
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
                    <p className="text-sm font-medium text-zinc-200">No results for "{q}"</p>
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
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          <ResultRow key={(item as any).id ?? i} item={item} bucket={bucket} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {!searched && !loading && (
                <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-3xl text-zinc-600">
                    ⌕
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-zinc-200">Start with a name, title, or URL</p>
                    <p className="max-w-md text-sm leading-6 text-zinc-500">
                      Search is the fastest way to jump into artist, track, playlist, or curator intelligence.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <p className="w-full text-[11px] uppercase tracking-wider text-zinc-600">Search examples</p>
                    {EXAMPLE_QUERIES.map((hint) => (
                      <span
                        key={hint}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              What you can search
            </p>
            <div className="mt-4 space-y-2">
              {[
                { icon: '♪', label: 'Artists', desc: 'By name or Spotify artist URL' },
                { icon: '♫', label: 'Tracks', desc: 'By title or Spotify track URL' },
                { icon: '▤', label: 'Playlists', desc: 'Editorial and algorithmic playlists' },
                { icon: '✦', label: 'Curators', desc: 'Playlist curators by platform' },
                { icon: '◫', label: 'Albums', desc: 'By title or YouTube URL' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <span className="mt-0.5 text-sm text-zinc-400">{item.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{item.label}</p>
                    <p className="text-[11px] leading-4 text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Search workflow
            </p>
            <div className="mt-4 space-y-3">
              {[
                'Enter a name, title, or paste a URL',
                'Select a scope filter if needed',
                'Review grouped results by entity type',
                'Save promising artists to your watchlist',
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

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Looking for something else?
            </p>
            <div className="mt-4 space-y-3">
              <Link href="/talent-scout" className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                <p className="text-sm font-semibold text-white">Talent Scout</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">AI-curated breakout discovery feed</p>
              </Link>
              <Link href="/compare" className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                <p className="text-sm font-semibold text-white">Compare Artists</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">Side-by-side momentum analysis</p>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
