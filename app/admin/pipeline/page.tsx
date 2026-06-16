import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { getPipelineStatus } from '@/lib/jobs/pipelineStatus'
import { PageShell } from '@/components/ui/PageShell'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function fmtDateTime(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ')
}

function statusTone(status: string): string {
  if (status === 'success') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
  if (status === 'failed') return 'border-rose-400/20 bg-rose-500/10 text-rose-300'
  return 'border-amber-400/20 bg-amber-500/10 text-amber-300'
}

export default async function AdminPipelinePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/admin/pipeline')
  if (user.role !== 'ADMIN') redirect('/')

  const { jobs, recentFailures, lastReconcile } = await getPipelineStatus()

  return (
    <PageShell
      title="Pipeline runs"
      description="Internal ETL/ingest job status — admin-only. This is intentionally not part of the user-facing Analytics page."
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Latest run per job
          </p>
          <div className="mt-4 space-y-2">
            {jobs.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-400">
                No job runs recorded yet — they appear as soon as any ingest or
                ETL job executes.
              </p>
            ) : (
              jobs.map((run) => (
                <div
                  key={run.jobName}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-300">{run.jobName}</p>
                    <p className="text-[11px] text-zinc-500">
                      {fmtDateTime(run.startedAt)}
                      {run.rowsWritten != null ? ` · ${run.rowsWritten} rows` : ''}
                      {run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(run.status)}`}
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
            Recent failures (7d)
          </p>
          <div className="mt-4 space-y-3">
            {recentFailures.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-400">
                No failures in the last 7 days.
              </p>
            ) : (
              recentFailures.map((f, i) => (
                <div
                  key={`${f.jobName}-${i}`}
                  className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.04] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-rose-200">{f.jobName}</p>
                    <p className="text-[11px] text-zinc-500">{fmtDateTime(f.startedAt)}</p>
                  </div>
                  {f.error ? (
                    <p className="mt-2 break-words font-mono text-[11px] leading-5 text-rose-300/90">
                      {f.error}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {lastReconcile ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Last reconcile
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-xs text-zinc-300">{fmtDateTime(lastReconcile.startedAt)}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(lastReconcile.status)}`}
                >
                  {lastReconcile.status}
                </span>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </PageShell>
  )
}
