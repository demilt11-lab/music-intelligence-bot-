'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { WatchlistEntry } from './WatchlistGrid'

type AddType = 'artist' | 'track'

type ResultItem = {
  entityType: AddType
  entityId: number
  name: string
  sub: string | null
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="14"
      height="14"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

/**
 * Search-and-add control for the Watchlist page.
 *
 * Lets users find artists and tracks (the two watchlist-eligible entity types)
 * and add them to their shortlist without leaving the page, addressing the
 * missing manual entry point (BUG-012). Results already on the watchlist are
 * shown as "Added" rather than offering a duplicate add.
 */
export function AddToWatchlistSearch({
  existing,
  onAdded,
}: {
  existing: WatchlistEntry[]
  onAdded: () => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set())

  const existingKeys = useMemo(() => {
    const set = new Set<string>()
    for (const item of existing) set.add(`${item.entityType}:${item.entityId}`)
    return set
  }, [existing])

  // Debounced search across artists + tracks. All state updates happen inside
  // the deferred timeout so nothing is set synchronously during render.
  useEffect(() => {
    const term = query.trim()
    const controller = new AbortController()

    const handle = setTimeout(async () => {
      if (!term) {
        setResults(null)
        setError(null)
        setSearching(false)
        return
      }

      setSearching(true)
      setError(null)
      try {
        const params = new URLSearchParams({ q: term, type: 'all', limit: '5' })
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Search failed (${res.status})`)
        const data = await res.json()
        const obj = data.obj ?? {}

        const artists: ResultItem[] = (obj.artists ?? []).map((a: any) => ({
          entityType: 'artist' as const,
          entityId: Number(a.id),
          name: String(a.name ?? 'Unknown artist'),
          sub: null,
        }))
        const tracks: ResultItem[] = (obj.tracks ?? []).map((t: any) => ({
          entityType: 'track' as const,
          entityId: Number(t.id),
          name: String(t.name ?? 'Untitled track'),
          sub: (t.artists ?? []).map((x: any) => x?.name).filter(Boolean).join(', ') || null,
        }))

        setResults([...artists, ...tracks].filter((r) => Number.isInteger(r.entityId)))
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          setError(e?.message ?? 'Search failed')
          setResults(null)
        }
      } finally {
        setSearching(false)
      }
    }, 250)

    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [query])

  const handleAdd = useCallback(
    async (item: ResultItem) => {
      const key = `${item.entityType}:${item.entityId}`
      setPendingKey(key)
      setError(null)
      try {
        const res = await fetch('/api/ui/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType: item.entityType, entityId: item.entityId }),
        })
        if (!res.ok) throw new Error(`Could not add (${res.status})`)
        setAddedKeys((prev) => new Set(prev).add(key))
        await onAdded()
      } catch (e: any) {
        setError(e?.message ?? 'Could not add — please retry.')
      } finally {
        setPendingKey(null)
      }
    },
    [onAdded],
  )

  const hasQuery = query.trim().length > 0

  return (
    <section className="mb-5 rounded-[22px] border border-white/10 bg-black/20 p-4">
      <label
        htmlFor="watchlist-add"
        className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500"
      >
        Add to watchlist
      </label>

      <div className="relative mt-2">
        <input
          id="watchlist-add"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an artist or track to add…"
          className="w-full rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 pr-10 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-emerald-400/30"
          aria-label="Search for an artist or track to add to your watchlist"
          autoComplete="off"
        />
        {searching ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <Spinner />
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {hasQuery ? (
        <div className="mt-3 space-y-1.5">
          {!searching && results && results.length === 0 ? (
            <p className="px-1 py-2 text-sm text-zinc-500">
              No artists or tracks matched “{query.trim()}”.
            </p>
          ) : null}

          {results?.map((item) => {
            const key = `${item.entityType}:${item.entityId}`
            const already = existingKeys.has(key) || addedKeys.has(key)
            const pending = pendingKey === key
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                    item.entityType === 'artist'
                      ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {item.entityType}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{item.name}</p>
                  {item.sub ? <p className="truncate text-xs text-zinc-500">{item.sub}</p> : null}
                </div>

                {already ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                    ✓ Added
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(item)}
                    disabled={pending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Add ${item.name} to watchlist`}
                  >
                    {pending ? <Spinner /> : <span aria-hidden="true">+</span>}
                    Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

export default AddToWatchlistSearch
