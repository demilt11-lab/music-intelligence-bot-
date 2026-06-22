'use client'

import React from 'react'
import { CompanionHeader } from './CompanionHeader'
import { ScoutTrackCard, type ScoutTrack } from './ScoutTrackCard'
import { TrackCardSkeleton } from '@/components/ui/Skeleton'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type ApiResponse = {
  obj: ScoutTrack[]
  meta: {
    date?: string
    code2: string
    mode: string
    dataSource?: string | null
    isSignalBacked?: boolean
    sourceError?: string
  }
}

function formatModeLabel(mode: 'ugc_early' | 'general') {
  return mode === 'ugc_early' ? 'Early UGC Breakouts' : 'General Momentum'
}

const MODE_LENS_CONTEXT: Record<
  'ugc_early' | 'general',
  { arRead: string; recommendedMove: string }
> = {
  ugc_early: {
    arRead:
      'Focus on records that are gaining attention early without needing full platform saturation. This view is best for finding movement before the wider market reacts.',
    recommendedMove:
      'Shortlist the top signals, review artist consistency, then route the strongest names into playlist, curator, and campaign analysis.',
  },
  general: {
    arRead:
      'Review tracks building momentum across all platforms, including records already in the mainstream cycle. Use this view for a broader market scan beyond early-breakout signals.',
    recommendedMove:
      'Compare momentum scores across platforms and filter by market alignment, then prioritize based on overall trajectory rather than early-breakout status alone.',
  },
}

const SOURCE_NOTES: Record<string, string> = {
  charts:
    'Live UGC breakout signals are not available for this market yet, so Buddy is showing recent chart activity instead. Treat these as established popularity, not breakout discoveries.',
  spotify_popular:
    'Live breakout signals are unavailable — showing popular catalog tracks for context only.',
  sample:
    'These are labeled sample rows for layout preview. No real scouting data is loaded.',
}

export function DailyTalentScout() {
  const [data, setData] = React.useState<ScoutTrack[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'ugc_early' | 'general'>('ugc_early')
  const [code2, setCode2] = React.useState('US')
  const [dataSource, setDataSource] = React.useState<string | null>(null)
  const [isSignalBacked, setIsSignalBacked] = React.useState(true)

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        code2,
        mode,
        limit: '50',
      })

      const res = await fetch(`/api/talent-scout/daily?${params}`)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Request failed ${res.status}`)
      }

      const json: ApiResponse = await res.json()
      setData(json.obj.map((t, i) => ({ ...t, rank: i + 1 })))
      setDataSource(json.meta.dataSource ?? null)
      setIsSignalBacked(json.meta.isSignalBacked ?? false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data.'
      setError(message)
      setData([])
      setDataSource(null)
    } finally {
      setIsLoading(false)
    }
  }, [code2, mode])

  React.useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Conviction tiers only mean something when the batch is signal-backed.
  const hotCount = isSignalBacked
    ? data.filter((t) => t.totalScore >= 0.5).length
    : null
  const watchCount = data.length
  const highConvictionCount = isSignalBacked
    ? data.filter((t) => t.totalScore >= 0.7).length
    : null
  const topTrack = data[0]
  const sourceNote = dataSource ? SOURCE_NOTES[dataSource] : undefined

  return (
    <section
      aria-label="Daily A&R Talent Scout"
      className="flex min-h-screen flex-col gap-5"
    >
      <CompanionHeader
        trackCount={data.length}
        hotCount={hotCount ?? 0}
        mode={mode}
        code2={code2}
        onModeChange={setMode}
        onMarketChange={setCode2}
        onRefresh={fetchData}
        isLoading={isLoading}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.10),transparent_22%)]" />

            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                    Live scout session
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                      Buddy is scanning {code2} for {formatModeLabel(mode).toLowerCase()}
                    </h2>
                    <p className="max-w-2xl text-sm leading-6 text-zinc-300">
                      Review emerging records, prioritize high-conviction signals, and move
                      faster on artists showing early traction across music and social
                      ecosystems.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[440px]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Tracks
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">{watchCount}</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                      Hot
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {hotCount ?? '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                      High Conviction
                    </p>
                    <p className="mt-1 text-lg font-semibold text-cyan-300">
                      {highConvictionCount ?? '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Market
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">{code2}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <CompanionMessage
                    type="info"
                    message={
                      topTrack && isSignalBacked
                        ? 'Top priority right now is ' + topTrack.name + (topTrack.artists.length ? ' by ' + topTrack.artists.join(', ') : '') + '. It is leading this scan based on combined momentum signals and should be reviewed first for A&R follow-up.'
                        : topTrack
                          ? "I'm showing " + topTrack.name + ' and other tracks from fallback data while live breakout signals are unavailable for this market.'
                          : "I'm standing by with the latest scout pass. Once signals load in, I'll highlight the best breakout opportunities for immediate review."
                    }
                  />
                </div>

                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Data status
                  </p>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    {isSignalBacked
                      ? 'This scan is backed by live UGC and ML signals. Conviction scores and recommended moves are active.'
                      : sourceNote ??
                        'Waiting on live scouting signals for this market. Conviction scoring is paused until real data arrives.'}
                  </p>
                </div>
              </div>

              {!isSignalBacked && data.length > 0 && sourceNote ? (
                <div
                  role="status"
                  className="rounded-[18px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-200"
                >
                  {sourceNote}
                </div>
              ) : null}
            </div>
          </section>

          {error && !isLoading ? (
            <div role="alert" className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
              <CompanionMessage
                message={`The scout feed failed to load: ${error}`}
                type="warning"
              />
              <button
                onClick={fetchData}
                className="mt-3 rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20"
              >
                Retry now
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3"
              aria-label="Loading tracks"
              aria-busy="true"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <TrackCardSkeleton key={i} />
              ))}
            </div>
          ) : null}

          {!isLoading && !error && data.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.82),rgba(10,10,11,0.94))] px-6 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-zinc-500">
                ◎
              </div>
              <div className="mt-5 max-w-md space-y-2">
                <p className="text-sm font-medium text-zinc-200">No live scout signals yet</p>
                <p className="text-sm leading-6 text-zinc-500">
                  {mode === 'ugc_early'
                    ? 'Buddy is watching for early UGC breakouts in this market. The ingest pipeline refreshes throughout the day, so new signals should appear as momentum builds.'
                    : 'No tracks match the active scout lens right now. Try switching market or returning to early-breakout mode.'}
                </p>
              </div>
              <button
                onClick={fetchData}
                className="mt-6 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                Refresh scout feed
              </button>
            </div>
          ) : null}

          {!isLoading && data.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3"
              aria-label={`${data.length} tracks`}
            >
              {data.map((track, idx) => (
                <ScoutTrackCard key={track.trackId} track={track} index={idx} />
              ))}
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Scout briefing
            </p>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Mode</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatModeLabel(mode)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">A&R read</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  {MODE_LENS_CONTEXT[mode].arRead}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Recommended move</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  {MODE_LENS_CONTEXT[mode].recommendedMove}
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
                "Scan today's breakout candidates",
                'Open top-ranking tracks',
                'Compare cross-platform momentum',
                "Push strongest leads into deeper A&R review",
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
    </section>
  )
}

export default DailyTalentScout
