'use client'

import React from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type ArtistSearchResult = {
  id: number
  name: string
  imageUrl: string | null
  code2: string | null
  spotifyFollowers: number | null
  score: number | null
}

type ArtistDetail = {
  id: number
  name: string
  imageUrl: string | null
  code2: string | null
  spotifyFollowers: number | null
  score: number | null
  status: string | null
  breakProbability: number | null
  streams28dDelta: number | null
  playlistsDelta28d: number | null
  followersDelta28d: number | null
}

function fmt(v: number | null | undefined, pct = false): string {
  if (v == null) return '—'
  const val = pct ? (v * 100).toFixed(1) + '%' : v > 0 ? `+${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(1)}%`
  return val
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString()
}

function metricTone(v: number | null | undefined) {
  const n = v ?? 0
  if (n > 0) return 'text-emerald-300'
  if (n < 0) return 'text-rose-300'
  return 'text-zinc-300'
}

const STATUS_LABELS: Record<string, string> = {
  ABOUT_TO_BREAK: 'About to break',
  GROWING: 'Growing',
  STABLE: 'Stable',
  DECLINING: 'Declining',
}

const STATUS_COLORS: Record<string, string> = {
  ABOUT_TO_BREAK: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  GROWING: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  STABLE: 'bg-white/5 text-zinc-300 border-white/10',
  DECLINING: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
}

function CompareMetricRow({
  label,
  valueA,
  valueB,
  toneA,
  toneB,
  winner,
}: {
  label: string
  valueA: string
  valueB: string
  toneA?: string
  toneB?: string
  winner?: 'A' | 'B' | null
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className={`text-sm font-semibold tabular-nums text-right ${toneA ?? 'text-zinc-200'}`}>{valueA}</p>
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500 text-center">{label}</p>
        {winner ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
            {winner === 'A' ? 'A wins' : 'B wins'}
          </span>
        ) : null}
      </div>
      <p className={`text-sm font-semibold tabular-nums text-left ${toneB ?? 'text-zinc-200'}`}>{valueB}</p>
    </div>
  )
}

export default function ComparePage() {
  const [artistA, setArtistA] = React.useState<ArtistDetail | null>(null)
  const [artistB, setArtistB] = React.useState<ArtistDetail | null>(null)

  const [queryA, setQueryA] = React.useState('')
  const [queryB, setQueryB] = React.useState('')
  const [resultsA, setResultsA] = React.useState<ArtistSearchResult[]>([])
  const [resultsB, setResultsB] = React.useState<ArtistSearchResult[]>([])
  const [searchingA, setSearchingA] = React.useState(false)
  const [searchingB, setSearchingB] = React.useState(false)
  const debounceA = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceB = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function searchFor(
    q: string,
    setter: (r: ArtistSearchResult[]) => void,
    loadingSetter: (v: boolean) => void,
    debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setter([]); return }
    debounceRef.current = setTimeout(() => {
      loadingSetter(true)
      fetch(`/api/search?q=${encodeURIComponent(q)}&type=artists&limit=5`)
        .then((r) => r.ok ? r.json() : null)
        .then((body) => { setter(body?.obj?.artists ?? []); loadingSetter(false) })
        .catch(() => loadingSetter(false))
    }, 250)
  }

  function selectArtist(slot: 'A' | 'B', r: ArtistSearchResult) {
    // Build an ArtistDetail from search result — richer data would come from /api/artists/:id
    const detail: ArtistDetail = {
      id: r.id,
      name: r.name,
      imageUrl: r.imageUrl,
      code2: r.code2,
      spotifyFollowers: r.spotifyFollowers,
      score: r.score,
      status: null,
      breakProbability: null,
      streams28dDelta: null,
      playlistsDelta28d: null,
      followersDelta28d: null,
    }
    // Try to enrich from breaking artists API
    fetch(`/api/artists/breaking?status=ABOUT_TO_BREAK&limit=200`)
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        const rows: Array<{ artistId: string; status: string; breakProbability: number | null; streams28dDelta: number; playlistsDelta28d: number | null; followersDelta28d: number | null }> = body?.obj ?? []
        const match = rows.find((row) => String(row.artistId) === String(r.id))
        if (match) {
          detail.status = match.status
          detail.breakProbability = match.breakProbability
          detail.streams28dDelta = match.streams28dDelta
          detail.playlistsDelta28d = match.playlistsDelta28d
          detail.followersDelta28d = match.followersDelta28d
        }
        if (slot === 'A') { setArtistA({ ...detail }); setQueryA(''); setResultsA([]) }
        else { setArtistB({ ...detail }); setQueryB(''); setResultsB([]) }
      })
      .catch(() => {
        if (slot === 'A') { setArtistA(detail); setQueryA(''); setResultsA([]) }
        else { setArtistB(detail); setQueryB(''); setResultsB([]) }
      })
  }

  const bothSelected = artistA !== null && artistB !== null

  function winnerOf(a: number | null, b: number | null): 'A' | 'B' | null {
    if (a == null || b == null) return null
    if (a > b) return 'A'
    if (b > a) return 'B'
    return null
  }

  return (
    <PageShell
      title="Compare Artists"
      description="Select two artists to compare their momentum, scout scores, streaming trajectory, and playlist performance side by side."
      actions={
        <Link
          href="/talent-scout"
          className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
        >
          Open Talent Scout
        </Link>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Artist selector slots */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Select two artists
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Search by name. Choose an artist for each slot, then review the comparison below.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* Slot A */}
              {artistA ? (
                <SlotCard
                  slot="A"
                  artist={artistA}
                  onClear={() => setArtistA(null)}
                  accentColor="cyan"
                />
              ) : (
                <SearchSlot
                  slot="A"
                  query={queryA}
                  results={resultsA}
                  searching={searchingA}
                  onChange={(q) => { setQueryA(q); searchFor(q, setResultsA, setSearchingA, debounceA) }}
                  onSelect={(r) => selectArtist('A', r)}
                  accentColor="cyan"
                />
              )}

              {/* Slot B */}
              {artistB ? (
                <SlotCard
                  slot="B"
                  artist={artistB}
                  onClear={() => setArtistB(null)}
                  accentColor="violet"
                />
              ) : (
                <SearchSlot
                  slot="B"
                  query={queryB}
                  results={resultsB}
                  searching={searchingB}
                  onChange={(q) => { setQueryB(q); searchFor(q, setResultsB, setSearchingB, debounceB) }}
                  onSelect={(r) => selectArtist('B', r)}
                  accentColor="violet"
                />
              )}
            </div>
          </section>

          {/* Head-to-head comparison table */}
          {bothSelected ? (
            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-center">
                  <p className="truncate text-sm font-semibold text-cyan-300">{artistA.name}</p>
                </div>
                <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">vs</p>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-center">
                  <p className="truncate text-sm font-semibold text-violet-300">{artistB.name}</p>
                </div>
              </div>

              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Metric comparison
              </p>

              <div className="space-y-2">
                <CompareMetricRow
                  label="Scout score"
                  valueA={artistA.score != null ? String(artistA.score) : '—'}
                  valueB={artistB.score != null ? String(artistB.score) : '—'}
                  winner={winnerOf(artistA.score, artistB.score)}
                />
                <CompareMetricRow
                  label="Spotify followers"
                  valueA={fmtNum(artistA.spotifyFollowers)}
                  valueB={fmtNum(artistB.spotifyFollowers)}
                  winner={winnerOf(artistA.spotifyFollowers, artistB.spotifyFollowers)}
                />
                <CompareMetricRow
                  label="Break probability"
                  valueA={artistA.breakProbability != null ? fmt(artistA.breakProbability, true) : '—'}
                  valueB={artistB.breakProbability != null ? fmt(artistB.breakProbability, true) : '—'}
                  winner={winnerOf(artistA.breakProbability, artistB.breakProbability)}
                />
                <CompareMetricRow
                  label="Streams 28d Δ"
                  valueA={artistA.streams28dDelta != null ? fmt(artistA.streams28dDelta) : '—'}
                  valueB={artistB.streams28dDelta != null ? fmt(artistB.streams28dDelta) : '—'}
                  toneA={metricTone(artistA.streams28dDelta)}
                  toneB={metricTone(artistB.streams28dDelta)}
                  winner={winnerOf(artistA.streams28dDelta, artistB.streams28dDelta)}
                />
                <CompareMetricRow
                  label="Playlists 28d Δ"
                  valueA={artistA.playlistsDelta28d != null ? fmt(artistA.playlistsDelta28d) : '—'}
                  valueB={artistB.playlistsDelta28d != null ? fmt(artistB.playlistsDelta28d) : '—'}
                  toneA={metricTone(artistA.playlistsDelta28d)}
                  toneB={metricTone(artistB.playlistsDelta28d)}
                  winner={winnerOf(artistA.playlistsDelta28d, artistB.playlistsDelta28d)}
                />
                <CompareMetricRow
                  label="Followers 28d Δ"
                  valueA={artistA.followersDelta28d != null ? fmt(artistA.followersDelta28d) : '—'}
                  valueB={artistB.followersDelta28d != null ? fmt(artistB.followersDelta28d) : '—'}
                  toneA={metricTone(artistA.followersDelta28d)}
                  toneB={metricTone(artistB.followersDelta28d)}
                  winner={winnerOf(artistA.followersDelta28d, artistB.followersDelta28d)}
                />
              </div>
            </section>
          ) : (
            <section className="flex flex-col items-center justify-center gap-4 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-12 text-center shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                ⇆
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-300">
                  Select both artists to see the comparison
                </p>
                <p className="text-xs text-zinc-500">
                  Pick an artist for slot A and slot B above — the side-by-side breakdown will appear here.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Buddy read
            </p>
            <div className="mt-4">
              <CompanionMessage
                type="insight"
                message={
                  !bothSelected
                    ? "Choose two artists using the search slots. I'll compare their momentum signals, scout scores, and trajectory metrics side by side."
                    : `Comparing ${artistA!.name} vs ${artistB!.name}. Look at streams and playlist deltas for 28-day momentum — those signals are more predictive than follower counts alone.`
                }
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              How to compare
            </p>
            <div className="mt-4 space-y-3">
              {[
                { step: 1, text: 'Search for artist A and select from results' },
                { step: 2, text: 'Search for artist B and select from results' },
                { step: 3, text: 'Review the head-to-head metric table' },
                { step: 4, text: 'Open artist profiles for deeper scouting' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10 text-[10px] font-bold text-violet-300">
                    {s.step}
                  </div>
                  <p className="text-xs leading-5 text-zinc-300">{s.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Quick links
            </p>
            <div className="mt-4 space-y-2">
              {[
                { href: '/talent-scout', label: 'Talent Scout', detail: 'Find breakout candidates' },
                { href: '/artists', label: 'Artist dashboard', detail: 'Filter by momentum stage' },
                { href: '/watchlist', label: 'Watchlist', detail: 'Your saved A&R targets' },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
                >
                  <p className="text-sm font-medium text-zinc-200">{l.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{l.detail}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SearchSlot({
  slot,
  query,
  results,
  searching,
  onChange,
  onSelect,
  accentColor,
}: {
  slot: 'A' | 'B'
  query: string
  results: ArtistSearchResult[]
  searching: boolean
  onChange: (q: string) => void
  onSelect: (r: ArtistSearchResult) => void
  accentColor: 'cyan' | 'violet'
}) {
  const c = {
    cyan: { border: 'border-cyan-400/20', text: 'text-cyan-300', ring: 'focus:border-cyan-400/30' },
    violet: { border: 'border-violet-400/20', text: 'text-violet-300', ring: 'focus:border-violet-400/30' },
  }[accentColor]

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <p className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${c.text}`}>
        Artist {slot}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Search by name.</p>

      <div className="relative mt-3">
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Search artist ${slot}…`}
          className={`w-full rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition ${c.ring}`}
        />
        {searching ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-zinc-300" />
          </div>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d12]">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{r.name}</p>
                {r.code2 ? <p className="text-xs text-zinc-500">{r.code2}</p> : null}
              </div>
              {r.score != null ? (
                <span className="ml-3 shrink-0 text-xs font-semibold text-zinc-400">
                  {r.score}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : query && !searching ? (
        <p className="mt-2 text-xs text-zinc-500">No results for "{query}".</p>
      ) : null}
    </div>
  )
}

function SlotCard({
  slot,
  artist,
  onClear,
  accentColor,
}: {
  slot: 'A' | 'B'
  artist: ArtistDetail
  onClear: () => void
  accentColor: 'cyan' | 'violet'
}) {
  const c = {
    cyan: { border: 'border-cyan-400/20', bg: 'bg-cyan-500/10', text: 'text-cyan-300', link: 'hover:bg-cyan-500/20' },
    violet: { border: 'border-violet-400/20', bg: 'bg-violet-500/10', text: 'text-violet-300', link: 'hover:bg-violet-500/20' },
  }[accentColor]

  const statusLabel = artist.status ? (STATUS_LABELS[artist.status] ?? artist.status) : null
  const statusColor = artist.status ? (STATUS_COLORS[artist.status] ?? STATUS_COLORS.STABLE) : null

  return (
    <div className={`rounded-[22px] border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${c.text}`}>
            Artist {slot}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white truncate">
            {artist.name}
          </h3>
          {statusLabel && statusColor ? (
            <span className={`mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
        >
          Change
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { label: 'Followers', value: fmtNum(artist.spotifyFollowers) },
          { label: 'Score', value: artist.score != null ? String(artist.score) : '—' },
          { label: 'Break %', value: artist.breakProbability != null ? fmt(artist.breakProbability, true) : '—' },
          { label: 'Region', value: artist.code2 ?? '—' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{m.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5">
        {[
          { label: 'Streams 28d', v: artist.streams28dDelta },
          { label: 'Playlists 28d', v: artist.playlistsDelta28d },
          { label: 'Followers 28d', v: artist.followersDelta28d },
        ].map((m) => (
          <div key={m.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-xs text-zinc-400">{m.label}</p>
            <p className={`text-xs font-semibold tabular-nums ${metricTone(m.v)}`}>
              {m.v != null ? fmt(m.v) : '—'}
            </p>
          </div>
        ))}
      </div>

      <Link
        href={`/artists/${artist.id}`}
        className={`mt-3 block rounded-xl border ${c.border} ${c.bg} px-3 py-2 text-center text-xs font-medium ${c.text} transition ${c.link}`}
      >
        Open profile →
      </Link>
    </div>
  )
}
