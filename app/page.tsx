import Link from 'next/link'
import { CommandBar } from '@/components/buddy/CommandBar'
import { ScoutingWorkflows } from '@/components/buddy/ScoutingWorkflows'

const START_HERE = [
  {
    href: '/talent-scout',
    label: 'Scout breakout artists',
    description: 'AI-curated feed of artists gaining momentum before they go mainstream.',
    accent: 'emerald',
    icon: '◎',
  },
  {
    href: '/search',
    label: 'Search artists & tracks',
    description: 'Search by name, genre, region, or paste a Spotify / YouTube URL.',
    accent: 'cyan',
    icon: '⌕',
  },
  {
    href: '/compare',
    label: 'Compare artists',
    description: 'Side-by-side streaming, social, playlist, and chart metrics.',
    accent: 'violet',
    icon: '⇆',
  },
  {
    href: '/watchlist',
    label: 'Open your watchlist',
    description: 'Review your saved targets and track their momentum over time.',
    accent: 'amber',
    icon: '◈',
  },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Scout early momentum', body: 'The Talent Scout feed surfaces artists and tracks gaining traction before the wider market reacts — ranked by UGC velocity, playlist adds, and cross-platform signals.' },
  { step: 2, title: 'Search any artist or URL', body: 'Search by name or paste a Spotify, YouTube, or Apple Music link to pull up artist intelligence, track trajectory, and platform data instantly.' },
  { step: 3, title: 'Save to your watchlist', body: 'Add promising artists and tracks to your watchlist and monitor their trend by week and month.' },
  { step: 4, title: 'Compare & decide', body: 'Compare two or more artists across streaming, social, and playlist metrics. Spot trajectory patterns before your competition does.' },
]

function accentClasses(accent: string) {
  switch (accent) {
    case 'emerald': return { border: 'border-emerald-400/20', bg: 'bg-emerald-500/10', text: 'text-emerald-300', icon: 'text-emerald-400' }
    case 'cyan': return { border: 'border-cyan-400/20', bg: 'bg-cyan-500/10', text: 'text-cyan-300', icon: 'text-cyan-400' }
    case 'violet': return { border: 'border-violet-400/20', bg: 'bg-violet-500/10', text: 'text-violet-300', icon: 'text-violet-400' }
    case 'amber': return { border: 'border-amber-400/20', bg: 'bg-amber-500/10', text: 'text-amber-300', icon: 'text-amber-400' }
    default: return { border: 'border-white/10', bg: 'bg-white/5', text: 'text-zinc-200', icon: 'text-zinc-400' }
  }
}

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-[#05070a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,#05070a_0%,#090b10_52%,#040506_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">

        {/* Hero + Buddy panel */}
        <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(56,189,248,0.16),transparent_22%),radial-gradient(circle_at_18%_76%,rgba(16,185,129,0.10),transparent_20%),radial-gradient(circle_at_82%_32%,rgba(244,114,182,0.12),transparent_18%)]" />

            <div className="relative flex min-h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-base text-emerald-400">
                    ◎
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      NOV8TE Buddy
                    </p>
                    <p className="text-sm text-zinc-400">
                      Track artist momentum early — before the market reacts.
                    </p>
                  </div>
                </div>
                <Link
                  href="/analytics"
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Workspace stats
                </Link>
              </div>

              <div className="flex flex-col gap-6 px-5 py-6 sm:px-6 lg:px-8">
                {/* Status + headline */}
                <div className="space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                    Buddy is online
                  </div>

                  <div className="max-w-2xl space-y-3">
                    <h2 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                      Your A&R intelligence command center.
                    </h2>
                    <p className="max-w-xl text-base leading-7 text-zinc-300">
                      Scout breakout artists, track momentum across Spotify, YouTube, TikTok,
                      playlists, charts, and radio — all in one workspace built for A&R.
                    </p>
                  </div>
                </div>

                {/* Search command */}
                <div className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Quick search
                  </p>

                  <CommandBar />
                </div>

                {/* Start here grid */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Start here
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {START_HERE.map((item) => {
                      const c = accentClasses(item.accent)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-start gap-3 rounded-[22px] border ${c.border} ${c.bg} p-4 transition hover:opacity-90`}
                        >
                          <span className={`mt-0.5 text-lg ${c.icon}`}>{item.icon}</span>
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${c.text}`}>{item.label}</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-400">{item.description}</p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Workflows + How it works */}
          <aside className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
              <ScoutingWorkflows />
            </div>

            {/* How it works — onboarding for first-time users */}
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                How this works
              </p>
              <div className="mt-4 space-y-3">
                {HOW_IT_WORKS.map((item) => (
                  <div
                    key={item.step}
                    className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-[10px] font-bold text-emerald-400">
                      {item.step}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
