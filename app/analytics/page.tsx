import Link from 'next/link'
import { db } from '@/lib/db'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import { logger } from '@/lib/logger'

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
  latestUgcDate: Date | null
  latestChartDate: Date | null
}

type JobRunSummary = {
  jobName: string
  status: string
  startedAt: Date
  durationMs: number | null
  rowsWritten: number | null
}

async function loadJobRuns(): Promise<JobRunSummary[]> {
  try {
    return await db.$queryRawUnsafe<JobRunSummary[]>(
      `SELECT DISTINCT ON ("jobName")
         "jobName", status, "startedAt", "durationMs", "rowsWritten"
       FROM job_runs
       ORDER BY "jobName", "startedAt" DESC
       LIMIT 30`,
    )
  } catch {
    return []
  }
}

async function loadWorkspaceStats(): Promise<WorkspaceStats | null> {
  try {
    const [
      watchlistCount,
      artistsTracked,
      tracksTracked,
      latestScore,
      latestUgc,
      latestChart,
      latestSnapshot,
    ] = await Promise.all([
      db.watchlistItem.count(),
      db.artist.count(),
      db.track.count(),
      db.talentScoutScore.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      db.ugcTrackMetrics.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      db.chartSnapshot.findFirst({
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      }),
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
      latestUgcDate: latestUgc?.date ?? null,
      latestChartDate: latestChart?.snapshotDate ?? null,
    }
  } catch (err) {
    logger.error('[analytics] failed to load workspace stats:', err)
    return null
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return 'no data yet'
  return d.toISOString().slice(0, 10)
}

function freshnessTone(d: Date | null): string {
  if (!d) return 'border-white/10 bg-white/5 text-zinc-400'
  const ageDays = (Date.now() - d.getTime()) / 86_400_000
  if (ageDays <= 2) return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
  if (ageDays <= 7) return 'border-amber-400/20 bg-amber-500/10 text-amber-300'
  return 'border-rose-400/20 bg-rose-500/10 text-rose-300'
}

const STATUS_LABELS: [string, string][] = [
  ['ABOUT_TO_BREAK', 'About to break'],
  ['GROWING', 'Growing'],
  ['STABLE', 'Stable'],
  ['DECLINING', 'Declining'],
]

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
        href="/search"
        className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
      >
        Search catalog
      </Link>
    </>
  )
}

export default async function AnalyticsPage() {
  const [stats, jobRuns] = await Promise.all([loadWorkspaceStats(), loadJobRuns()])

  const kpis = stats
    ? [
        {
          label: 'Watchlist items',
          value: stats.watchlistCount.toLocaleString(),
          detail: 'Artists and tracks saved for active follow-up',
        },
        {
          label: 'Scout signals (latest day)',
          value: stats.scoutSignals.toLocaleString(),
          detail: stats.scoutSignalDate
            ? `Viral-score rows computed for ${fmtDate(stats.scoutSignalDate)}`
            : 'No scout scores computed yet',
        },
        {
          label: 'Artists in catalog',
          value: stats.artistsTracked.toLocaleString(),
          detail: `${stats.tracksTracked.toLocaleString()} tracks ingested alongside`,
        },
        {
          label: 'Markets with UGC data',
          value: stats.marketsMonitored.toLocaleString(),
          detail: 'Distinct territories present in TikTok UGC metrics',
        },
      ]
    : []

  return (
    <PageShell
      title="Analytics"
      description="A live operational read on the workspace: catalog coverage, signal freshness, and where artist momentum is concentrated right now. Every number on this page is queried from the database."
      actions={<AnalyticsHeroActions />}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Workspace overview
                </p>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                  Current intelligence footprint
                </h2>
              </div>

              {stats ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {kpis.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
                    >
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        {card.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                        {card.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{card.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[22px] border border-rose-400/20 bg-rose-500/10 p-4">
                  <CompanionMessage
                    type="warning"
                    message="Workspace metrics are unavailable — the database could not be reached. Check the deployment's DATABASE_URL and try again."
                  />
                </div>
              )}
            </div>
          </section>

          {stats ? (
            <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Artist momentum cohorts
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  From the latest trajectory snapshot
                  {stats.latestSnapshotDate ? ` (${fmtDate(stats.latestSnapshotDate)})` : ''}.
                </p>
                <div className="mt-4 space-y-3">
                  {stats.latestSnapshotDate ? (
                    STATUS_LABELS.map(([key, label]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <p className="text-sm font-semibold text-white">{label}</p>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold tabular-nums text-zinc-200">
                          {(stats.statusCounts[key] ?? 0).toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-400">
                      No trajectory snapshots have been computed yet. Run the artist
                      ETL (or the etl-artist-trajectory cron) to populate momentum
                      cohorts.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Data freshness
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Latest ingested day per signal source. Stale sources degrade
                  ranking quality and are flagged here instead of hidden.
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: 'TikTok UGC metrics', date: stats.latestUgcDate },
                    { label: 'Scout viral scores', date: stats.scoutSignalDate },
                    { label: 'Chart snapshots', date: stats.latestChartDate },
                    { label: 'Artist trajectories', date: stats.latestSnapshotDate },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.04] p-4"
                    >
                      <p className="text-sm text-zinc-300">{row.label}</p>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${freshnessTone(row.date)}`}
                      >
                        {fmtDate(row.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Pipeline runs
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Latest execution per job, recorded by the run tracker.
            </p>
            <div className="mt-4 space-y-2">
              {jobRuns.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-400">
                  No job runs recorded yet — they appear as soon as any ingest or
                  ETL job executes.
                </p>
              ) : (
                jobRuns.map((run) => (
                  <div
                    key={run.jobName}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-300">
                        {run.jobName}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(run.startedAt).toISOString().slice(0, 16).replace('T', ' ')}
                        {run.rowsWritten != null ? ` · ${run.rowsWritten} rows` : ''}
                        {run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        run.status === 'success'
                          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                          : run.status === 'failed'
                            ? 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                            : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Quick access
            </p>
            <div className="mt-4 space-y-3">
              {[
                { href: '/talent-scout', label: 'Talent Scout', detail: 'Breakout triage and signal review' },
                { href: '/artists', label: 'Artists', detail: 'Artist-level intelligence and movement' },
                { href: '/search', label: 'Search', detail: 'Query the catalog and entities' },
                { href: '/watchlist', label: 'Watchlist', detail: 'Monitor saved leads and targets' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-[20px] border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{item.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Reading this page
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
              <p>
                Counts come straight from the workspace database; nothing here is
                projected or estimated.
              </p>
              <p>
                If a source shows “no data yet”, its ingestion job hasn’t run against
                this environment — the corresponding product views will say so too.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
