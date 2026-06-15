'use client'

import React from 'react'
import { RisingTalentCard } from './RisingTalentCard'
import { CollaborationCard } from './CollaborationCard'
import { TrackCardSkeleton } from '@/components/ui/Skeleton'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import type { RisingTalentEntry, WriterProducerResult, ExternalCreatorHit } from '@/lib/writersProducers/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchResponse = {
  obj: {
    database: WriterProducerResult[]
    external: ExternalCreatorHit[]
    query: string
    type: string
    platforms: string[]
  }
}

type CollabResponse = {
  obj: {
    id: number
    name: string
    collaborations: import('@/lib/writersProducers/types').Collaboration[]
  }
}

type RisingResponse = {
  obj: RisingTalentEntry[]
  meta: { count: number; type: string; region: string; unsignedOnly: boolean }
}

type Tab = 'rising' | 'search'
type CreatorType = 'all' | 'writer' | 'producer'

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] transition',
        active
          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── External hit card ────────────────────────────────────────────────────────

function ExternalHitCard({ hit }: { hit: ExternalCreatorHit }) {
  const PLATFORM_STYLES: Record<string, string> = {
    spotify: 'border-emerald-400/20 bg-emerald-500/8 text-emerald-300',
    youtube: 'border-red-400/20 bg-red-500/8 text-red-300',
    soundcloud: 'border-orange-400/20 bg-orange-500/8 text-orange-300',
    blog: 'border-cyan-400/20 bg-cyan-500/8 text-cyan-300',
  }
  const cls = PLATFORM_STYLES[hit.platform] ?? 'border-white/10 bg-white/5 text-zinc-300'

  return (
    <div className="rounded-[20px] border border-white/10 bg-[rgba(18,18,20,0.96)] p-4 space-y-2">
      <div className="flex items-start gap-3">
        {hit.imageUrl ? (
          <img
            src={hit.imageUrl}
            alt={hit.name}
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
            <span className="text-sm text-zinc-500">♪</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${cls}`}>
              {hit.platform}
            </span>
          </div>
          <h4 className="mt-1 truncate text-sm font-semibold text-white">{hit.name}</h4>
          {hit.bio && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-400">{hit.bio}</p>
          )}
        </div>
        {hit.followerCount != null && (
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-white">
              {hit.followerCount >= 1_000_000
                ? `${(hit.followerCount / 1_000_000).toFixed(1)}M`
                : hit.followerCount >= 1_000
                  ? `${(hit.followerCount / 1_000).toFixed(1)}K`
                  : hit.followerCount}
            </p>
            <p className="text-[10px] text-zinc-500">followers</p>
          </div>
        )}
      </div>

      {hit.playlists.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hit.playlists.slice(0, 3).map((pl, i) => (
            <a
              key={i}
              href={pl.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white transition"
            >
              {pl.name}
              {pl.trackCount ? ` (${pl.trackCount})` : ''}
            </a>
          ))}
        </div>
      )}

      {hit.profileUrl && (
        <a
          href={hit.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition"
        >
          View on {hit.platform} →
        </a>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WriterProducerSearch() {
  const [tab, setTab] = React.useState<Tab>('rising')
  const [creatorType, setCreatorType] = React.useState<CreatorType>('all')
  const [region, setRegion] = React.useState('GLOBAL')
  const [unsignedOnly, setUnsignedOnly] = React.useState(false)

  // Rising talent state
  const [rising, setRising] = React.useState<RisingTalentEntry[]>([])
  const [risingLoading, setRisingLoading] = React.useState(false)
  const [risingError, setRisingError] = React.useState<string | null>(null)
  const [risingMeta, setRisingMeta] = React.useState<RisingResponse['meta'] | null>(null)

  // Search state
  const [query, setQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<SearchResponse['obj'] | null>(null)
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [searchError, setSearchError] = React.useState<string | null>(null)

  // Selected creator for collabs
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [collabs, setCollabs] = React.useState<CollabResponse['obj'] | null>(null)
  const [collabsLoading, setCollabsLoading] = React.useState(false)

  // ── Rising talent fetch ──────────────────────────────────────────────────

  const fetchRising = React.useCallback(async () => {
    setRisingLoading(true)
    setRisingError(null)
    try {
      const params = new URLSearchParams({
        type: creatorType,
        region,
        unsigned: unsignedOnly ? '1' : '0',
        limit: '30',
      })
      const res = await fetch(`/api/writers-producers/rising?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
      }
      const json: RisingResponse = await res.json()
      setRising(json.obj)
      setRisingMeta(json.meta)
    } catch (err) {
      setRisingError(err instanceof Error ? err.message : 'Failed to load rising talent.')
      setRising([])
    } finally {
      setRisingLoading(false)
    }
  }, [creatorType, region, unsignedOnly])

  React.useEffect(() => {
    if (tab === 'rising') void fetchRising()
  }, [tab, fetchRising])

  // ── Search fetch ──────────────────────────────────────────────────────────

  const handleSearch = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults(null)
    setSelectedId(null)
    setCollabs(null)
    try {
      const params = new URLSearchParams({
        q: query,
        type: creatorType,
        limit: '20',
        external: '1',
      })
      const res = await fetch(`/api/writers-producers/search?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
      }
      const json: SearchResponse = await res.json()
      setSearchResults(json.obj)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearchLoading(false)
    }
  }, [query, creatorType])

  // ── Collabs fetch ─────────────────────────────────────────────────────────

  const fetchCollabs = React.useCallback(async (id: number) => {
    setSelectedId(id)
    setCollabsLoading(true)
    setCollabs(null)
    try {
      const res = await fetch(`/api/writers-producers/${id}/collaborations?limit=10`)
      if (!res.ok) return
      const json: CollabResponse = await res.json()
      setCollabs(json.obj)
    } finally {
      setCollabsLoading(false)
    }
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1">
          {(['rising', 'search'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'rounded-xl px-4 py-2 text-[12px] font-medium uppercase tracking-[0.14em] transition',
                tab === t
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200',
              ].join(' ')}
            >
              {t === 'rising' ? 'AI Rising Talent' : 'Search'}
            </button>
          ))}
        </div>

        {/* Creator type filter */}
        <div className="flex gap-1.5">
          {(['all', 'writer', 'producer'] as CreatorType[]).map((t) => (
            <FilterChip key={t} active={creatorType === t} onClick={() => setCreatorType(t)}>
              {t === 'all' ? 'All Creators' : t === 'writer' ? 'Writers' : 'Producers'}
            </FilterChip>
          ))}
        </div>

        {/* Unsigned toggle */}
        <button
          type="button"
          onClick={() => setUnsignedOnly((v) => !v)}
          className={[
            'rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] transition',
            unsignedOnly
              ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-300'
              : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200',
          ].join(' ')}
        >
          Unsigned Only
        </button>

        {/* Region selector */}
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300 outline-none focus:border-white/20"
        >
          {['GLOBAL', 'US', 'GB', 'AU', 'CA', 'NG', 'BR', 'DE', 'FR', 'KR'].map((r) => (
            <option key={r} value={r} className="bg-zinc-900">
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* ── Rising tab ── */}
      {tab === 'rising' && (
        <div>
          {risingMeta && (
            <p className="mb-4 text-[12px] text-zinc-400">
              {risingMeta.count} rising{' '}
              {risingMeta.type === 'all' ? 'writers & producers' : risingMeta.type + 's'} detected
              {risingMeta.unsignedOnly ? ' (unsigned only)' : ''} · {risingMeta.region}
            </p>
          )}

          {risingLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <TrackCardSkeleton key={i} />
              ))}
            </div>
          )}

          {risingError && (
            <CompanionMessage
              message={risingError}
              type="warning"
            />
          )}

          {!risingLoading && !risingError && rising.length === 0 && (
            <CompanionMessage
              message="No rising scores have been computed yet. Run the ETL job to generate AI talent scores."
              type="info"
            />
          )}

          {!risingLoading && rising.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rising.map((entry, i) => (
                <RisingTalentCard
                  key={entry.songwriterId}
                  entry={entry}
                  rank={i + 1}
                  onSelect={fetchCollabs}
                />
              ))}
            </div>
          )}

          {/* Collab drawer */}
          {selectedId != null && (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-[rgba(14,14,16,0.98)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {collabs ? `Collaborations · ${collabs.name}` : 'Loading collaborations…'}
                </h3>
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setCollabs(null) }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>

              {collabsLoading && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <TrackCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {collabs && collabs.collaborations.length === 0 && (
                <CompanionMessage message="No collaboration data found for this creator." type="info" />
              )}

              {collabs && collabs.collaborations.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {collabs.collaborations.map((c) => (
                    <CollaborationCard key={c.trackId} collab={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Search tab ── */}
      {tab === 'search' && (
        <div className="space-y-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a writer or producer by name…"
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/25 focus:bg-white/8 transition"
            />
            <button
              type="submit"
              disabled={searchLoading || !query.trim()}
              className="rounded-2xl border border-white/10 bg-white/8 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/14 disabled:opacity-40"
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {searchError && (
            <CompanionMessage message={searchError} type="warning" />
          )}

          {searchResults && (
            <div className="space-y-6">
              {/* DB results */}
              {searchResults.database.length > 0 && (
                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    In database ({searchResults.database.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {searchResults.database.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-[20px] border border-white/10 bg-[rgba(18,18,20,0.96)] p-4 space-y-2 cursor-pointer hover:border-white/20 transition"
                        onClick={() => fetchCollabs(r.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && fetchCollabs(r.id)}
                        aria-label={`View collaborations for ${r.name}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-semibold text-white">{r.name}</h4>
                          {r.risingScore != null && (
                            <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              {Math.round(r.risingScore * 100)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-violet-400/20 bg-violet-500/8 px-2 py-0.5 text-[10px] text-violet-300">
                            {r.creatorType === 'writer'
                              ? 'Songwriter'
                              : r.creatorType === 'producer'
                                ? 'Producer'
                                : 'Writer/Producer'}
                          </span>
                          {!r.isSigned && (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/8 px-2 py-0.5 text-[10px] text-cyan-300">
                              Unsigned
                            </span>
                          )}
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                            {r.trackCount} tracks
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">Click to view playlist & chart data →</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* External results */}
              {searchResults.external.length > 0 && (
                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    External platforms ({searchResults.external.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {searchResults.external.map((hit, i) => (
                      <ExternalHitCard key={i} hit={hit} />
                    ))}
                  </div>
                </div>
              )}

              {searchResults.database.length === 0 && searchResults.external.length === 0 && (
                <CompanionMessage
                  message={`No results found for "${searchResults.query}". Try a broader search or check the spelling.`}
                  type="info"
                />
              )}
            </div>
          )}

          {/* Collab drawer for search results */}
          {selectedId != null && tab === 'search' && (
            <div className="rounded-[24px] border border-white/10 bg-[rgba(14,14,16,0.98)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {collabs ? `Collaborations · ${collabs.name}` : 'Loading collaborations…'}
                </h3>
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setCollabs(null) }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>

              {collabsLoading && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <TrackCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {collabs && collabs.collaborations.length === 0 && (
                <CompanionMessage message="No collaboration data found for this creator." type="info" />
              )}

              {collabs && collabs.collaborations.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {collabs.collaborations.map((c) => (
                    <CollaborationCard key={c.trackId} collab={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default WriterProducerSearch
