'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, use } from 'react';
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import { SkeletonBox } from '@/components/ui/Skeleton'
import { TrendSparkline } from '@/components/ui/TrendSparkline'
import { safeDisplayName } from '@/lib/shared/text'

type Artist = {
  id: string
  name: string
  code2: string | null
}

type ExplanationFactor = {
  factor: string
  value: number | null
  display: string
  direction: 'positive' | 'negative' | 'neutral'
  note: string
}

type ModelAccuracy = {
  modelName: string
  evaluationDate: string
  windowDays: number
  totalPredictions: number
  accuracy: number
  precision: number | null
  recall: number | null
}

type ArtistDailyStats = {
  artistId: bigint
  date: string
  totalStreams: string
  playlistCount: number | null
  editorialPlaylistCount: number | null
  indiePlaylistCount: number | null
  playlistReach: string | null
  genres: string[]
  primaryCode2: string | null
}

type ArtistTrajectorySnapshot = {
  id: bigint
  artistId: bigint
  date: string
  streams7d: number
  streams28d: number
  streams90d: number
  streams7dDelta: number
  streams28dDelta: number
  streams90dDelta: number
  followersDelta28d: number | null
  playlistsDelta28d: number | null
  primaryGenre: string | null
  primaryCode2: string | null
  status: string
  statusScore: number
  breakProbability: number | null
}

type Release = {
  id: string
  name: string
  isrc: string | null
  albums: { id: bigint; name: string }[]
  statistics: {
    spotifyStreams: string | null
  } | null
}

type TrajectoryResponse = {
  obj: {
    artist: Artist
    snapshot: ArtistTrajectorySnapshot | null
    explanation: ExplanationFactor[]
    modelAccuracy: ModelAccuracy | null
    history: ArtistDailyStats[]
    releases: Release[]
  }
}

function formatPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

function formatInt(v: string | number | null | undefined) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString()
}

function statusTone(status: string) {
  switch (status) {
    case 'ABOUT_TO_BREAK':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-300'
    case 'GROWING':
      return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
    case 'DECLINING':
      return 'border-rose-400/20 bg-rose-500/10 text-rose-300'
    default:
      return 'border-white/10 bg-white/5 text-zinc-300'
  }
}

function deltaTone(v: number | null | undefined) {
  if (v == null) return 'text-zinc-400'
  if (v > 0) return 'text-emerald-300'
  if (v < 0) return 'text-rose-300'
  return 'text-zinc-400'
}

function summarize(snapshot: ArtistTrajectorySnapshot | null) {
  if (!snapshot) {
    return 'This artist does not yet have a trajectory snapshot, so Buddy can only offer a limited read from the currently available history and release data.'
  }

  if (
    snapshot.status === 'ABOUT_TO_BREAK' ||
    (snapshot.breakProbability ?? 0) >= 0.7 ||
    snapshot.streams28dDelta > 0.25
  ) {
    return 'This artist is showing strong breakout behavior and should be treated as a high-priority A&R target for immediate deeper review.'
  }

  if (
    snapshot.status === 'GROWING' ||
    snapshot.streams28dDelta > 0 ||
    (snapshot.followersDelta28d ?? 0) > 0
  ) {
    return 'This artist has positive forward movement across key signals and deserves continued monitoring with attention on acceleration quality.'
  }

  return 'This artist currently reads more like a watch candidate than an immediate move, but the profile is still worth keeping in the system.'
}

export default function ArtistPage(
  props: {
    params: Promise<{ artistId: string }>
  }
) {
  const params = use(props.params);
  const [data, setData] = useState<TrajectoryResponse['obj'] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      try {
        const res = await fetch(`/api/artists/${params.artistId}/trajectory`)

        if (!res.ok) {
          setData(null)
          setLoading(false)
          return
        }

        const json: TrajectoryResponse = await res.json()
        setData(json.obj)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [params.artistId])

  const summary = useMemo(() => {
    if (!data?.history?.length) {
      return {
        latestStreams: null,
        latestPlaylists: null,
        latestReach: null,
      }
    }

    const latest = data.history[0]

    return {
      latestStreams: latest?.totalStreams ?? null,
      latestPlaylists: latest?.playlistCount ?? null,
      latestReach: latest?.playlistReach ?? null,
    }
  }, [data])

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="space-y-4">
            <SkeletonBox className="h-5 w-32" />
            <SkeletonBox className="h-10 w-72" />
            <SkeletonBox className="h-5 w-96 max-w-full" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBox key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5"
              >
                <div className="space-y-3">
                  <SkeletonBox className="h-4 w-32" />
                  <SkeletonBox className="h-28 w-full rounded-2xl" />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5"
              >
                <div className="space-y-3">
                  <SkeletonBox className="h-4 w-24" />
                  <SkeletonBox className="h-24 w-full rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Artist intelligence
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">
              Artist trajectory not available
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Buddy couldn’t load this artist intelligence record from the trajectory endpoint.
            </p>
          </div>

          <div className="mt-6">
            <CompanionMessage
              type="warning"
              message="Open another artist from the Artists table or Search and try again."
            />
          </div>

          <div className="mt-6">
            <Link
              href="/artists"
              className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Back to Artist Intelligence
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { artist, snapshot, explanation, modelAccuracy, history, releases } = data

  // Oldest → newest stream series for the sparkline
  const streamSeries = [...history]
    .reverse()
    .map((h) => Number(h.totalStreams))

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                  Artist intelligence
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                    {safeDisplayName(artist.name, 'Unknown Artist')}
                  </h1>
                  <p className="text-sm text-zinc-400 sm:text-[15px]">
                    {snapshot?.primaryGenre || '—'} ·{' '}
                    {snapshot?.primaryCode2 || artist.code2 || '—'}
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                    Buddy is reading this artist across breakout probability, stream movement,
                    playlist lift, follower change, and release context so you can judge whether
                    the act deserves deeper A&R attention.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[460px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    Status
                  </p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(snapshot?.status || 'UNKNOWN')}`}
                    >
                      {(snapshot?.status || 'UNKNOWN').replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                    Break %
                  </p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">
                    {snapshot?.breakProbability != null
                      ? `${(snapshot.breakProbability * 100).toFixed(1)}%`
                      : '—'}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                    Streams 28d
                  </p>
                  <p className={`mt-1 text-lg font-semibold ${deltaTone(snapshot?.streams28dDelta)}`}>
                    {formatPct(snapshot?.streams28dDelta)}
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                    Followers 28d
                  </p>
                  <p
                    className={`mt-1 text-lg font-semibold ${deltaTone(snapshot?.followersDelta28d)}`}
                  >
                    {formatPct(snapshot?.followersDelta28d)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <CompanionMessage type="insight" message={summarize(snapshot)} />
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Streams — last {streamSeries.length} days
                </p>
                <div className="mt-4">
                  {streamSeries.length > 1 ? (
                    <TrendSparkline data={streamSeries} width={280} height={56} />
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Not enough daily history for a trend line yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
          <div className="space-y-5">
            {explanation.length > 0 ? (
              <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Why this status
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Every factor below maps directly to a stored signal
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {explanation.map((f) => (
                    <div
                      key={f.factor}
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{f.factor}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{f.note}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums ${
                          f.direction === 'positive'
                            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                            : f.direction === 'negative'
                              ? 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                              : 'border-white/10 bg-white/5 text-zinc-300'
                        }`}
                      >
                        {f.display}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-zinc-500">
                  {modelAccuracy
                    ? `Model context: ${modelAccuracy.modelName} has been ${(modelAccuracy.accuracy * 100).toFixed(0)}% accurate across ${modelAccuracy.totalPredictions.toLocaleString()} predictions evaluated over ${modelAccuracy.windowDays}-day outcomes (as of ${String(modelAccuracy.evaluationDate).slice(0, 10)}).`
                    : 'No model accuracy report is available yet — prediction outcomes are evaluated 30 days after they are logged, so this fills in as live data accumulates.'}
                </p>
              </section>
            ) : null}

            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Snapshot metrics
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Streams 7d Δ',
                    value: formatPct(snapshot?.streams7dDelta),
                    tone: deltaTone(snapshot?.streams7dDelta),
                  },
                  {
                    label: 'Streams 28d Δ',
                    value: formatPct(snapshot?.streams28dDelta),
                    tone: deltaTone(snapshot?.streams28dDelta),
                  },
                  {
                    label: 'Playlists 28d Δ',
                    value: formatPct(snapshot?.playlistsDelta28d),
                    tone: deltaTone(snapshot?.playlistsDelta28d),
                  },
                  {
                    label: 'Followers 28d Δ',
                    value: formatPct(snapshot?.followersDelta28d),
                    tone: deltaTone(snapshot?.followersDelta28d),
                  },
                ].map(({ label, value, tone }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      {label}
                    </p>
                    <p className={`mt-2 text-sm font-semibold ${tone}`}>{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Trajectory history
                </h2>
                <p className="text-xs text-zinc-500">{history.length} records</p>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[20px] border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/[0.04] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-right font-medium">Streams</th>
                      <th className="px-4 py-3 text-right font-medium">Playlists</th>
                      <th className="px-4 py-3 text-right font-medium">Playlist reach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr className="border-t border-white/10">
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">
                          No daily history available yet for this artist.
                        </td>
                      </tr>
                    ) : history.map((h) => (
                      <tr
                        key={`${h.artistId}-${h.date}`}
                        className="border-t border-white/10 text-zinc-300"
                      >
                        <td className="px-4 py-3">{h.date.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatInt(h.totalStreams)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {h.playlistCount ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {h.playlistReach ? formatInt(h.playlistReach) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Releases
                </h2>
                <p className="text-xs text-zinc-500">{releases.length} tracks</p>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[20px] border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/[0.04] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Track</th>
                      <th className="px-4 py-3 text-left font-medium">Album</th>
                      <th className="px-4 py-3 text-left font-medium">ISRC</th>
                      <th className="px-4 py-3 text-right font-medium">Spotify streams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.length === 0 ? (
                      <tr className="border-t border-white/10">
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">
                          No linked releases found for this artist.
                        </td>
                      </tr>
                    ) : releases.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-white/10 text-zinc-300"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-100">{r.name}</td>
                        <td className="px-4 py-3">{r.albums?.[0]?.name || '—'}</td>
                        <td className="px-4 py-3">{r.isrc || '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.statistics?.spotifyStreams
                            ? formatInt(r.statistics.spotifyStreams)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <p className="text-xs font-medium text-zinc-400">Artist</p>
                  <p className="mt-1 text-sm font-semibold text-white">{safeDisplayName(artist.name, 'Unknown Artist')}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Primary market</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    {snapshot?.primaryCode2 || artist.code2 || 'Unknown'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Current scale</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    Latest streams: {summary.latestStreams ? formatInt(summary.latestStreams) : '—'}
                    <br />
                    Playlist reach: {summary.latestReach ? formatInt(summary.latestReach) : '—'}
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
                  'Review breakout probability and status',
                  'Validate stream and playlist momentum',
                  'Check release depth and streaming scale',
                  'Move into watchlist or active pursuit',
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
      </section>
    </div>
  )
}
