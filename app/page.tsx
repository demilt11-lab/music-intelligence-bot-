import Link from 'next/link'
import { BuddyCharacter } from '@/components/buddy/BuddyCharacter'
import { CommandBar } from '@/components/buddy/CommandBar'
import { ScoutingWorkflows } from '@/components/buddy/ScoutingWorkflows'

const QUICK_TASKS = [
  { label: 'Scout early UGC breakouts', href: '/talent-scout' },
  { label: 'Review breaking artists', href: '/artists' },
  { label: 'Check genre momentum', href: '/genres' },
  { label: 'Open my watchlist', href: '/watchlist' },
]

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-[#05070a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,#05070a_0%,#090b10_52%,#040506_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(56,189,248,0.16),transparent_22%),radial-gradient(circle_at_18%_76%,rgba(16,185,129,0.10),transparent_20%),radial-gradient(circle_at_82%_32%,rgba(244,114,182,0.12),transparent_18%)]" />

            <div className="relative flex min-h-full flex-col">
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

                    <div className="mt-4 flex flex-wrap gap-2">
                      {QUICK_TASKS.map((task) => (
                        <Link
                          key={task.label}
                          href={task.href}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
                        >
                          {task.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative flex min-h-[560px] items-center justify-center rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.55),rgba(5,7,10,0.85))] p-6">
                  <BuddyCharacter />
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur xl:flex xl:flex-col">
            <ScoutingWorkflows />

            <div className="mt-6 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 xl:mt-auto">
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
    </div>
  )
}
