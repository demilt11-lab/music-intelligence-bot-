import Link from 'next/link'

const QUICK_TASKS = [
  'Scout breakout Jersey club artists',
  'Find emerging R&B songwriters',
  'Identify producer momentum shifts',
  'Review viral TikTok crossover signals',
]

const ACTIVE_QUEUES = [
  { label: 'Artist scouting', value: '18 live scans' },
  { label: 'Writer sourcing', value: '6 open briefs' },
  { label: 'Producer watch', value: '11 movement alerts' },
]

export default function HomePage() {
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
              {[
                'Home',
                'Scout Artists',
                'Scout Writers',
                'Scout Producers',
                'Assignments',
                'Watchlists',
                'Reports',
                'Analytics',
              ].map((item, index) => (
                <div
                  key={item}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                    index === 0
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400'
                  }`}
                >
                  <span>{item}</span>
                  {index === 0 ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]" />
                  ) : null}
                </div>
              ))}
            </nav>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Live queues
              </p>
              <div className="mt-4 space-y-3">
                {ACTIVE_QUEUES.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <p className="text-xs text-zinc-500">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-200">
                      {item.value}
                    </p>
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

                    <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex min-h-[120px] flex-col justify-between gap-4">
                        <p className="text-sm leading-7 text-zinc-300">
                          What do you want me to scout today?
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <div className="flex-1 rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-zinc-500">
                            Scout breakout R&B producers with viral crossover signals
                          </div>
                          <button className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20">
                            Run task
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {QUICK_TASKS.map((task) => (
                        <button
                          key={task}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
                        >
                          {task}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative flex min-h-[560px] items-end justify-center rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.55),rgba(5,7,10,0.85))] p-6">
                  <div className="absolute inset-x-10 top-10 h-28 rounded-[24px] border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(10,20,35,0.65),rgba(6,10,18,0.2))] shadow-[0_0_80px_rgba(34,211,238,0.08)]" />
                  <div className="absolute left-10 top-28 h-40 w-32 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
                  <div className="absolute right-12 top-24 h-48 w-40 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]" />
                  <div className="absolute bottom-12 left-8 right-8 h-24 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />

                  <div className="absolute bottom-24 left-[14%] h-24 w-24 rounded-full bg-emerald-500/10 blur-3xl" />
                  <div className="absolute right-[18%] top-[20%] h-24 w-24 rounded-full bg-sky-500/10 blur-3xl" />

                  <div className="relative z-10 flex flex-col items-center">
                    <div className="relative flex h-[330px] w-[250px] items-center justify-center">
                      <div className="absolute inset-x-8 bottom-1 h-10 rounded-full bg-emerald-400/20 blur-2xl" />
                      <div className="absolute left-1/2 top-0 h-20 w-20 -translate-x-1/2 rounded-full border border-emerald-300/30 bg-[radial-gradient(circle_at_50%_40%,rgba(167,243,208,0.95),rgba(16,185,129,0.35)_52%,rgba(255,255,255,0.06)_100%)] shadow-[0_0_40px_rgba(52,211,153,0.28)]" />
                      <div className="absolute left-1/2 top-[74px] h-[158px] w-[158px] -translate-x-1/2 rounded-[42px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_30px_80px_rgba(0,0,0,0.35)]" />
                      <div className="absolute left-1/2 top-[110px] flex -translate-x-1/2 items-center gap-6">
                        <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
                        <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
                      </div>
                      <div className="absolute left-1/2 top-[145px] h-10 w-16 -translate-x-1/2 rounded-full border border-emerald-300/20 bg-emerald-400/10" />
                      <div className="absolute left-1/2 top-[248px] h-24 w-[180px] -translate-x-1/2 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]" />
                    </div>

                    <div className="mt-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300">
                      Buddy is idle — awaiting your next assignment.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur xl:flex xl:flex-col">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Active direction
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
                Tasks for Buddy
              </h3>
            </div>

            <div className="mt-6 space-y-3">
              {[
                'Scout female pop writers with recent sync momentum',
                'Find producers rising on TikTok before DSP crossover',
                'Review artists with strong saves-to-streams ratios',
                'Build a watchlist of breakout Latin collaborators',
              ].map((task, index) => (
                <div
                  key={task}
                  className="rounded-[22px] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-zinc-300">{task}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Insight mode
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Buddy should guide the user first. Deep charts, metrics, and tracking live in
                Analytics, not on the home screen.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
