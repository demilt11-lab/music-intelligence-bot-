import Link from 'next/link'
import { db } from '@/lib/db'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type WorkspaceStats = {
  watchlistCount: number
  artistsTracked: number
  tracksTracked: number
  scoutSignals: number
  scoutSignalDate: Date | null
  marketsMonitored: number
  statusCounts: Record<string, number>
  latestSnapshotDate: Date | null
}

async function loadWorkspaceStats(): Promise<WorkspaceStats | null> {
  try {
    const [
      watchlistCount,
      artistsTracked,
      tracksTracked,
      latestScore,
      latestSnapshot,
    ] = await Promise.all([
      db.watchlistItem.count(),
      db.artist.count(),
      db.track.count(),
      db.talentScoutScore.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      db.artistTrajectorySnapshot.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ])

    const [scoutSignals, markets, statusRows] = await Promise.all([
      latestScore
        ? db.talentScoutScore.count({ where: { date: latestScore.date } })
        : Promise.resolve(0),
      db.ugcTrackMetrics.findMany({
        distinct: ['code2'],
        select: { code2: true },
      }),
      latestSnapshot
        ? db.artistTrajectorySnapshot.groupBy({
            by: ['status'],
            where: { date: latestSnapshot.date },
            _count: { _all: true },
          })
        : Promise.resolve([] as { status: string; _count: { _all: number } }[]),
    ])

    const statusCounts: Record<string, number> = {}
    for (const row of statusRows) statusCounts[row.status] = row._count._all

    return {
      watchlistCount,
      artistsTracked,
      tracksTracked,
      scoutSignals,
      scoutSignalDate: latestScore?.date ?? null,
      marketsMonitored: markets.length,
      statusCounts,
      latestSnapshotDate: latestSnapshot?.date ?? null,
    }
  } catch (err) {
    console.error('[analytics] failed to load workspace stats:', err)
    return null
  }
}

const STATUS_LABELS: [string, string, string][] = [
  ['ABOUT_TO_BREAK', 'About to break', 'Artists showing breakout signals right now — highest priority for A&R action.'],
  ['GROWING', 'Growing', 'Artists with consistent upward momentum across signals.'],
  ['STABLE', 'Stable', 'Artists holding position — monitor but not urgent.'],
  ['DECLINING', 'Declining', 'Artists losing momentum — exercise caution before signing.'],
]

const STATUS_COLORS: Record<string, string> = {
  ABOUT_TO_BREAK: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  GROWING: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
  STABLE: 'border-white/10 bg-white/5 text-zinc-200',
  DECLINING: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
}

function AnalyticsHeroActions() {
  return (
    <>
      <Link
        href="/talent-scout"
        className="inline-flex items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
      >
        Open Talent Scout
      </Link>
      <Link
        href="/watchlist"
        className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
      >
        View watchlist
      </Link>
    </>
  )
}

export default async function AnalyticsPage() {
  const stats = await loadWorkspaceStats()

  const kpis = stats
    ? [
        {
          label: 'Watchlist items',
          value: stats.watchlistCount.toLocaleString(),
          detail: 'Saved artists and tracks under active A&R monitoring.',
          accent: 'emerald',
        },
        {
          label: 'Active scout signals',
          value: stats.scoutSignals.toLocaleString(),
          detail: stats.scoutSignalDate
            ? `Viral-score rows computed for ${stats.scoutSignalDate.toISOString().slice(0, 10)}`
            : 'No scout scores yet — run the talent scout to generate signals.',
          accent: 'cyan',
        },
        {
          label: 'Artists in catalog',
          value: stats.artistsTracked.toLocaleString(),
          detail: `${stats.tracksTracked.toLocaleString()} tracks tracked alongside.`,
          accent: 'violet',
        },
        {
          label: 'Markets monitored',
          value: stats.marketsMonitored.toLocaleString(),
          detail: 'Distinct territories with active TikTok UGC signals.',
          accent: 'amber',
        },
      ]
    : []

  const accentBorder: Record<string, string> = {
    emerald: 'border-emerald-400/20',
    cyan: 'border-cyan-400/20',
    violet: 'border-violet-400/20',
    amber: 'border-amber-400/20',
  }
  const accentBg: Record<string, string> = {
    emerald: 'bg-emerald-500/10',
    cyan: 'bg-cyan-500/10',
    violet: 'bg-violet-500/10',
    amber: 'bg-amber-500/10',
  }
  const accentText: Record<string, string> = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    violet: 'text-violet-300',
    amber: 'text-amber-300',
  }

  return (
    <PageShell
      title="Workspace Analytics"
      description="A live read on your scouting coverage: catalog depth, signal freshness, watchlist health, and where artist momentum is concentrated right now."
      actions={<AnalyticsHeroActions />}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* KPI grid */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Coverage at a glance
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Live counts from the workspace database — nothing estimated.
            </p>

            {stats ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {kpis.map((card) => (
                  <div
                    key={card.label}
                    className={`rounded-[22px] border ${accentBorder[card.accent]} ${accentBg[card.accent]} p-4`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      {card.label}
                    </p>
                    <p className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${accentText[card.accent]}`}>
                      {card.value}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{card.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-rose-400/20 bg-rose-500/10 p-4">
                <CompanionMessage
                  type="warning"
                  message="Workspace metrics are unavailable — the database could not be reached. Check DATABASE_URL and try again."
                />
              </div>
            )}
          </section>

          {/* Artist momentum cohorts */}
          {stats ? (
            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Artist momentum cohorts
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                From the latest trajectory snapshot
                {stats.latestSnapshotDate
                  ? ` (${stats.latestSnapshotDate.toISOString().slice(0, 10)})`
                  : ' — not yet computed'}.
                Run the ETL to populate.
              </p>

              <div className="mt-4 space-y-3">
                {stats.latestSnapshotDate ? (
                  STATUS_LABELS.map(([key, label, desc]) => (
                    <div
                      key={key}
                      className={`flex items-start justify-between gap-4 rounded-[20px] border p-4 ${STATUS_COLORS[key]}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{label}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">{desc}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold tabular-nums text-zinc-200">
                        {(stats.statusCounts[key] ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                    <p className="text-sm text-zinc-400">
                      No trajectory snapshots have been computed yet.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Run the <code className="font-mono text-zinc-300">etl-artist-trajectory</code> cron job or the corresponding ETL script to populate momentum cohorts. Once data is available, this view will show how many artists are in each growth stage.
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {/* Watchlist CTA */}
          <section className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  {stats && stats.watchlistCount > 0
                    ? `You have ${stats.watchlistCount} artist${stats.watchlistCount !== 1 ? 's' : ''} on your watchlist.`
                    : 'Your watchlist is empty.'}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {stats && stats.watchlistCount > 0
                    ? 'Review their momentum trends, viral scores, and trajectory movement.'
                    : 'Save promising artists from Talent Scout, Search, or artist pages to start monitoring them.'}
                </p>
              </div>
              <Link
                href="/watchlist"
                className="shrink-0 inline-flex items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                {stats && stats.watchlistCount > 0 ? 'Open watchlist →' : 'Start watchlist →'}
              </Link>
            </div>
          </section>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Quick actions
            </p>
            <div className="mt-4 space-y-3">
              {[
                { href: '/talent-scout', label: 'Talent Scout', detail: 'Scan today\'s AI breakout feed', accent: 'emerald' },
                { href: '/watchlist', label: 'Watchlist', detail: 'Review your saved A&R targets', accent: 'cyan' },
                { href: '/search', label: 'Search catalog', detail: 'Find any artist, track, or playlist', accent: 'violet' },
                { href: '/compare', label: 'Compare artists', detail: 'Side-by-side momentum analysis', accent: 'amber' },
                { href: '/artists', label: 'Artist dashboard', detail: 'Filter by status, genre, region', accent: 'default' },
                { href: '/alerts', label: 'Set up alerts', detail: 'Get notified on momentum spikes', accent: 'default' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-[20px] border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.07]"
                >
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              How to read this page
            </p>
            <div className="mt-4 space-y-3 text-xs leading-5 text-zinc-300">
              <p>
                <strong className="text-zinc-200">Coverage at a glance</strong> shows how much data your workspace is currently tracking — artists, tracks, scout signals, and market breadth.
              </p>
              <p>
                <strong className="text-zinc-200">Artist momentum cohorts</strong> groups all tracked artists by their current trajectory status so you can prioritize A&R action.
              </p>
              <p>
                All numbers come directly from the database. Nothing here is projected or estimated.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
