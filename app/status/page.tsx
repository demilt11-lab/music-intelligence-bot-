'use client'

import React from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type JobRow = {
  jobName: string
  status: string
  startedAt: string
  durationMs: number | null
  rowsWritten: number | null
  error: string | null
}

type Anomaly = {
  id: number
  entityType: 'track' | 'artist'
  entityId: number | null
  entityName: string | null
  metric: string
  zScore: number
  currentValue: number
  baselineMean: number
  severity: string
  detectedAt: string
}

type Freshness = {
  slaHours: number
  ugcTrackMetrics: { date: string | null; ageHours: number | null; fresh: boolean }
  ugcGenreMetrics: { date: string | null; ageHours: number | null; fresh: boolean }
  genrePlaylistMetrics: { date: string | null; ageHours: number | null; fresh: boolean }
}

type StatusResponse = {
  jobs: JobRow[]
  recentFailures: Array<{ jobName: string; startedAt: string; durationMs: number | null; error: string | null }>
  lastReconcile: { startedAt: string; status: string } | null
  freshness: Freshness
  anomalies: Anomaly[]
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.round(ms / 60_000)}m ago`
  if (hours < 48) return `${hours.toFixed(1)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function StatusPage() {
  const [data, setData] = React.useState<StatusResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [needsAuth, setNeedsAuth] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/ui/pipeline-status')
        if (res.status === 401) {
          setNeedsAuth(true)
          return
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json = (await res.json()) as { obj: StatusResponse }
        setData(json.obj)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load pipeline status')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (needsAuth) {
    return (
      <PageShell title="Pipeline Status" description="Sign in to view operational status.">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-6">
          <CompanionMessage type="warning" message="Sign in to view pipeline and data-health status." />
          <div className="mt-4">
            <Link href="/login" className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20">
              Sign in
            </Link>
          </div>
        </div>
      </PageShell>
    )
  }

  const freshnessEntries = data
    ? [
        { label: 'UGC track metrics', ...data.freshness.ugcTrackMetrics },
        { label: 'UGC genre metrics', ...data.freshness.ugcGenreMetrics },
        { label: 'Genre playlist metrics', ...data.freshness.genrePlaylistMetrics },
      ]
    : []

  return (
    <PageShell
      title="Pipeline Status"
      description="Live ingest/ETL job health, data freshness, and unacknowledged anomalies — the first place to look when something looks off."
    >
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Data freshness</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {loading && !data ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : (
                freshnessEntries.map((f) => (
                  <div
                    key={f.label}
                    className={`rounded-2xl border p-4 ${f.fresh ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">{f.label}</p>
                    <p className={`mt-1 text-sm font-semibold ${f.fresh ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {f.fresh ? 'Fresh' : 'Stale'} — {timeAgo(f.date)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-500">SLA: {data?.freshness.slaHours ?? '—'}h</p>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Latest job runs</p>
            <div className="mt-4 space-y-2">
              {loading && !data ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : data && data.jobs.length > 0 ? (
                data.jobs.map((j) => (
                  <div key={j.jobName} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <span className="truncate font-mono text-xs text-zinc-300">{j.jobName}</span>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                      {j.rowsWritten != null && <span>{j.rowsWritten} rows</span>}
                      <span>{timeAgo(j.startedAt)}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          j.status === 'success'
                            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                            : j.status === 'failed'
                              ? 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                              : 'border-white/10 bg-white/5 text-zinc-400'
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No job runs recorded yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Unacknowledged anomalies (7d, high severity)
            </p>
            <div className="mt-4 space-y-2">
              {loading && !data ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : data && data.anomalies.length > 0 ? (
                data.anomalies.map((a) => (
                  <div key={a.id} className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-200">
                        {a.entityName ?? `${a.entityType} #${a.entityId}`}
                      </span>
                      <span className="text-xs text-amber-300">z={a.zScore.toFixed(1)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {a.metric}: {a.currentValue.toFixed(2)} vs baseline {a.baselineMean.toFixed(2)} · {timeAgo(a.detectedAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No unacknowledged high-severity anomalies in the last 7 days.</p>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Recent failures (7d)</p>
            <div className="mt-4 space-y-2">
              {loading && !data ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : data && data.recentFailures.length > 0 ? (
                data.recentFailures.map((f, i) => (
                  <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-zinc-300">{f.jobName}</span>
                      <span className="text-xs text-zinc-500">{timeAgo(f.startedAt)}</span>
                    </div>
                    {f.error && <p className="mt-1 truncate text-xs text-rose-300">{f.error}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No failures in the last 7 days.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Buddy read</p>
            <div className="mt-4">
              <CompanionMessage
                type="insight"
                message="This is the honest view of the data pipeline — real job runs, real freshness checks, real anomaly scores. Nothing here is simulated."
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Last reconciliation</p>
            <p className="mt-3 text-sm text-zinc-300">
              {data?.lastReconcile
                ? `${data.lastReconcile.status} — ${timeAgo(data.lastReconcile.startedAt)}`
                : 'No reconciliation run recorded yet.'}
            </p>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
