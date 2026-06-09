import Link from 'next/link'
import { ChartsClient } from './ChartsClient'
import { RadioClient } from './RadioClient'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

async function getTrack(trackId: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    ''

  try {
    const res = await fetch(`${baseUrl}/api/tracks/${trackId}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.obj
  } catch {
    return null
  }
}

type TrackPageProps = {
  params: Promise<{ trackId: string }>
}

function formatArtists(track: any) {
  return track?.artists?.map((a: { name: string }) => a.name).join(', ') || 'Unknown artist'
}

function summarizeTrack(track: any) {
  const spotifyPopularity = track?.statistics?.spotifyPopularity ?? 0
  const spotifyStreams = Number(track?.statistics?.spotifyStreams ?? 0)
  const tiktokVideos = Number(track?.statistics?.tiktokVideoCount ?? 0)
  const youtubeViews = Number(track?.statistics?.youtubeViews ?? 0)

  if (spotifyPopularity >= 70 || spotifyStreams > 5_000_000 || tiktokVideos > 100_000) {
    return 'This record is already showing meaningful traction and should be treated as an active priority for A&R follow-up.'
  }

  if (spotifyPopularity >= 45 || tiktokVideos > 10_000 || youtubeViews > 500_000) {
    return 'This track has credible early movement across key platforms and is worth monitoring closely for acceleration.'
  }

  return 'This is currently a lower-signal record, but it remains useful as a watchlist candidate while broader momentum develops.'
}

function metricValue(value: unknown) {
  return value ?? '—'
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { trackId } = await params
  const track = await getTrack(trackId)

  if (!track) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Track intelligence
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">
              Track not found
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              The requested track could not be loaded from the intelligence API.
            </p>
          </div>

          <div className="mt-6">
            <CompanionMessage
              type="warning"
              message="Buddy couldn’t locate this track record. Double-check the track ID or return to scouting and open a valid result."
            />
          </div>

          <div className="mt-6">
            <Link
              href="/talent-scout"
              className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Back to Buddy Scout
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const spotifyPopularity = track.statistics?.spotifyPopularity
  const spotifyStreams = track.statistics?.spotifyStreams
  const tiktokVideoCount = track.statistics?.tiktokVideoCount
  const youtubeViews = track.statistics?.youtubeViews

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  Track intelligence
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                    {track.name ?? 'Track'}
                  </h1>
                  <p className="text-sm text-zinc-400 sm:text-[15px]">
                    {formatArtists(track)}
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                    Buddy is reading this record across metadata, platform traction, charts, and radio context so you can assess whether it deserves deeper A&R attention.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[460px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    Spotify Pop
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {metricValue(spotifyPopularity)}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                    Spotify Streams
                  </p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">
                    {metricValue(spotifyStreams)}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">
                    TikTok Videos
                  </p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">
                    {metricValue(tiktokVideoCount)}
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-rose-200/70">
                    YouTube Views
                  </p>
                  <p className="mt-1 text-lg font-semibold text-rose-300">
                    {metricValue(youtubeViews)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <CompanionMessage
                  type="insight"
                  message={summarizeTrack(track)}
                />
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Suggested next steps
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    'Check chart velocity',
                    'Review radio support',
                    'Validate playlist fit',
                    'Compare artist context',
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
                Core metadata
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'ISRC', value: track.isrc },
                  { label: 'Release date', value: track.releaseDate },
                  { label: 'Label', value: track.albumLabel },
                  { label: 'Tier', value: track.trackTier },
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
                Platform stats
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Spotify popularity', value: track.statistics?.spotifyPopularity },
                  { label: 'Spotify streams', value: track.statistics?.spotifyStreams },
                  { label: 'TikTok videos', value: track.statistics?.tiktokVideoCount },
                  { label: 'YouTube views', value: track.statistics?.youtubeViews },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-zinc-100 tabular-nums">
                      {metricValue(value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <ChartsClient trackId={trackId} />
            <RadioClient trackId={trackId} />
          </div>

          <aside className="space-y-5">
            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Buddy read
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Track</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {track.name ?? '—'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Artists</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    {formatArtists(track)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium text-zinc-400">Recommended move</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    Use chart progression and radio support together to judge whether this record is moving as a short-term breakout, a steady growth story, or just early noise.
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
                  'Validate platform traction',
                  'Review chart movement',
                  'Inspect radio support',
                  'Route into artist-level analysis',
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
    </div>
  )
}
