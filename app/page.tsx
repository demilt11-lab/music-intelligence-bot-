import Link from 'next/link'
import { db } from '@/lib/db'
import { BuddyCharacter } from '@/components/buddy/BuddyCharacter'
import { CommandBar } from '@/components/buddy/CommandBar'
import { QuickTaskChips } from '@/components/buddy/QuickTaskChips'
import { PRIMARY_NAV } from '@/components/layout/navItems'

export const dynamic = 'force-dynamic'

type QueueStats = {
  scoutSignals: number | null
  breakingArtists: number | null
  watchlistItems: number | null
}

async function loadQueueStats(): Promise<QueueStats> {
  try {
    const [latestScore, latestSnapshot, watchlistItems] = await Promise.all([
      db.talentScoutScore.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      db.artistTrajectorySnapshot.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      db.watchlistItem.count(),
    ])

    const [scoutSignals, breakingArtists] = await Promise.all([
      latestScore
        ? db.talentScoutScore.count({ where: { date: latestScore.date } })
        : Promise.resolve(0),
      latestSnapshot
        ? db.artistTrajectorySnapshot.count({
            where: { date: latestSnapshot.date, status: 'ABOUT_TO_BREAK' },
          })
        : Promise.resolve(0),
    ])

    return { scoutSignals, breakingArtists, watchlistItems }
  } catch (err) {
    console.error('[home] queue stats unavailable:', err)
    return { scoutSignals: null, breakingArtists: null, watchlistItems: null }
  }
}

function queueValue(v: number | null, unit: string): string {
  if (v == null) return 'unavailable'
  return `${v.toLocaleString()} ${unit}`
}

export default async function HomePage() {
  const stats = await loadQueueStats()

  const activeQueues = [
    { label: 'Scout signals (latest day)', value: queueValue(stats.scoutSignals, 'tracks scored') },
    { label: 'About-to-break artists', value: queueValue(stats.breakingArtists, 'flagged') },
    { label: 'Watchlist', value: queueValue(stats.watchlistItems, 'items saved') },
  ]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,#05070a_0%,#090b10_52%,#040506_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[calc(100vh-2rem)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur xl:flex xl:flex-col">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                NOV8TE
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                Buddy A&R
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Your AI scout for artists, writers, producers, and breakout signals.
              </p>
            </div>

            <nav className="mt-8 space-y-2">
              {PRIMARY_NAV.map((item, index) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                    index === 0
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  <span>{item.label}</span>
                  {index === 0 ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]" />
                  ) : null}
                </Link>
              ))}
            </nav>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Live queues
              </p>
              <div className="mt-4 space-y-3">
                {activeQueues.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <p className="text-xs text-zinc-500">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-200">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(56,189,248,0.16),transparent_22%),radial-gradient(circle_at_18%_76%,rgba(16,185,129,0.10),transparent_20%),radial-gradient(circle_at_82%_32%,rgba(244,114,182,0.12),transparent_18%)]" />

            <div className="relative flex min-h-[calc(100vh-2rem)] flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Buddy Home
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Music office command center
                  </p>
                </div>

                <Link
                  href="/analytics"
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Open Analytics
                </Link>
              </div>

              <div className="grid flex-1 gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
                <div className="flex flex-col justify-between gap-6">
                  <div className="space-y-5">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                      Buddy is online
                    </div>

                    <div className="max-w-2xl space-y-4">
                      <h2 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                        Your A&R bot is in the office and ready for instructions.
                      </h2>
                      <p className="max-w-xl text-base leading-7 text-zinc-300">
                        Give Buddy a task to scout artists, find writers, identify producers,
                        surface momentum shifts, and turn music data into actionable A&R intel.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Command Buddy
                    </p>

                    <CommandBar />

                    <QuickTaskChips />
                  </div>
                </div>

                <div className="relative flex min-h-[560px] items-center justify-center rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.55),rgba(5,7,10,0.85))] p-6">
                  <BuddyCharacter />
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur xl:flex xl:flex-col">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Start here
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
                Scouting workflows
              </h3>
            </div>

            <div className="mt-6 space-y-3">
              {[
                {
                  label: 'Triage today’s early UGC breakouts in Talent Scout',
                  href: '/talent-scout',
                },
                {
                  label: 'Review artists flagged as about to break',
                  href: '/artists',
                },
                {
                  label: 'Compare genre momentum across markets',
                  href: '/genres',
                },
                {
                  label: 'Keep your shortlist current in the watchlist',
                  href: '/watchlist',
                },
              ].map((task, index) => (
                <Link
                  key={task.label}
                  href={task.href}
                  className="block rounded-[22px] border border-white/10 bg-black/20 p-4 transition hover:bg-black/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-zinc-300">{task.label}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Insight mode
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Buddy guides the workflow from here. Deep charts, metrics, and tracking
                live in Analytics and the entity pages.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
