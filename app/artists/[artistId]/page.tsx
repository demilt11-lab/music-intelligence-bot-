import Link from 'next/link'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

async function getArtist(artistId: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    ''

  try {
    const res = await fetch(`${baseUrl}/api/artists/${artistId}`, {
      cache: 'no-store',
    })

    if (!res.ok) return null
    const data = await res.json()
    return data.obj
  } catch {
    return null
  }
}

type ArtistPageProps = {
  params: Promise<{ artistId: string }>
}

function metricValue(value: unknown) {
  return value ?? '—'
}

function summarizeArtist(artist: any) {
  const breakProbability = Number(artist?.breakProbability ?? 0)
  const streamsDelta = Number(artist?.streams28dDelta ?? 0)
  const playlistsDelta = Number(artist?.playlistsDelta28d ?? 0)
  const followersDelta = Number(artist?.followersDelta28d ?? 0)

  if (breakProbability >= 0.7 || streamsDelta > 0.25 || playlistsDelta > 0.25) {
    return 'This artist is showing meaningful breakout conditions and should be treated as a high-priority A&R target for deeper review.'
  }

  if (breakProbability >= 0.4 || streamsDelta > 0 || followersDelta > 0) {
    return 'This artist has positive movement across key signals and is worth continued monitoring for acceleration.'
  }

  return 'This artist currently reads more like a watch candidate than an immediate priority, but the profile is still worth keeping in view.'
}

function toneClass(value: number | null | undefined) {
  const v = value ?? 0
  if (v > 0) return 'text-emerald-300'
  if (v < 0) return 'text-rose-300'
  return 'text-zinc-400'
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function formatProbability(value: number | null | undefined) {
  if (value == null) return '—'
  return `${(value * 100).toFixed(0)}%`
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { artistId } = await params
  const artist = await getArtist(artistId)

  if (!artist) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Artist intelligence
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">
              Artist not found
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              The requested artist could not be loaded from the intelligence API.
            </p>
          </div>

          <div className="mt-6">
            <CompanionMessage
              type="warning"
              message="Buddy couldn’t locate this artist record. Double-check the artist ID or return to Artist Intelligence and open a valid result."
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
                    {artist.name ?? 'Artist'}
                  </h1>
                  <p className="text-sm text-zinc-400 sm:text-[15px]">
                    {artist.primaryGenre ?? 'Genre unavailable'} · {artist.primaryCode2 ?? artist.code2 ?? 'Region unavailable'}
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                    Buddy is reading this artist across breakout probability, audience movement, playlist lift, and follower growth so you can judge whether the act deserves deeper A&R attention.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[460px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {metricValue(artist.status)}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                    Break %
                  </p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">
                    {formatProbability(artist.breakProbability)}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                    Streams 28d
                  </p>
                  <p className={`mt-1 text-lg font-semibold ${toneClass(artist.streams28dDelta)}`}>
                    {formatPercent(artist.streams28dDelta)}
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                    Followers 28d
                  </p>
                  <p className={`mt-1 text-lg font-semibold ${toneClass(artist.followersDelta28d)}`}>
                    {formatPercent(artist.followersDelta28d)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <CompanionMessage
                  type="insight"
                  message={summarizeArtist(artist)}
                />
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Suggested next steps
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    'Compare growth signals',
                    'Validate playlist movement',
                    'Check track-level momentum',
                    'Move into watchlist if conviction builds',
                  ].map((action) => (
                    <span
                      key={action}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Core profile
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Artist ID', value: artist.artistId ?? artist.id ?? artistId },
                  { label: 'Primary genre', value: artist.primaryGenre },
                  { label: 'Primary market', value: artist.primaryCode2 ?? artist.code2 },
                  { label: 'Status score', value: artist.statusScore },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {metricValue(value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Growth signals
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Break probability',
                    value: formatProbability(artist.breakProbability),
                    tone: 'text-zinc-100',
                  },
                  {
                    label: 'Streams 28d',
                    value: formatPercent(artist.streams28dDelta),
                    tone: toneClass(artist.streams28dDelta),
                  },
                  {
                    label: 'Playlists 28d',
                    value: formatPercent(artist.playlistsDelta28d),
                    tone: toneClass(artist.playlistsDelta28d),
                  },
                  {
                    label: 'Followers 28d',
                    value: formatPercent(artist.followersDelta28d),
                    tone: toneClass(artist.followersDelta28d),
                  },
                ].map(({ label, value, tone }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      {label}
                    </p>
                    <p className={`mt-2 text-sm font-semibold ${tone}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.86),rgba(10,10,11,0.94))] p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Buddy interpretation
              </h2>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Momentum read</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Use streams, playlists, and follower movement together. A positive move across all three usually matters more than one isolated spike.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">A&R recommendation</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    If break probability and playlist lift are both improving, this artist should likely be pushed into track-level and campaign-level analysis next.
                  </p>
                </div>
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
                  <p className="mt-1 text-sm font-semibold text-white">
                    {artist.name ?? '—'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Market context</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    {artist.primaryCode2 ?? artist.code2 ?? 'Unknown region'} · {artist.primaryGenre ?? 'Unknown genre'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Recommended move</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    Use this page to decide whether the artist belongs in active pursuit, continued monitoring, or watchlist-only mode.
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
                  'Review break probability',
                  'Validate audience and playlist movement',
                  'Check supporting track intelligence',
                  'Route into watchlist or active follow-up',
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
