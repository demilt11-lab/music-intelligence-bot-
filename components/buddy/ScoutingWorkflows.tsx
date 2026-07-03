'use client'

import React from 'react'
import Link from 'next/link'

type Workflow = {
  id: string
  label: string
  href?: string
}


const WORKFLOWS_KEY = 'buddy.scoutingWorkflows.v1'
const DIRECTIVE_KEY = 'buddy.directive.v1'

const DEFAULT_DIRECTIVE =
  'Prioritize early UGC breakouts in my core markets, flag rights complexity early, and keep my watchlist current.'

const DEFAULT_WORKFLOWS: Workflow[] = [
  { id: 'w1', label: 'Triage today’s early UGC breakouts in Talent Scout', href: '/talent-scout' },
  { id: 'w2', label: 'Review artists flagged as about to break', href: '/artists' },
  { id: 'w3', label: 'Compare genre momentum across markets', href: '/genres' },
  { id: 'w4', label: 'Keep your shortlist current in the watchlist', href: '/watchlist' },
]

function newId(): string {
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function ScoutingWorkflows() {
  const [mounted, setMounted] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [workflows, setWorkflows] = React.useState<Workflow[]>(DEFAULT_WORKFLOWS)
  const [directive, setDirective] = React.useState(DEFAULT_DIRECTIVE)
  const syncTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate after mount (avoids SSR/client mismatch). Prefer per-user server
  // state; fall back to the local cache, then to defaults.
  React.useEffect(() => {
    setMounted(true)
    let active = true

    function loadLocal() {
      try {
        const rawWf = window.localStorage.getItem(WORKFLOWS_KEY)
        if (rawWf) {
          const parsed = JSON.parse(rawWf) as Workflow[]
          if (Array.isArray(parsed)) setWorkflows(parsed)
        }
        const rawDir = window.localStorage.getItem(DIRECTIVE_KEY)
        if (rawDir != null) setDirective(rawDir)
      } catch {
        /* corrupt storage — keep defaults */
      }
    }

    fetch('/api/ui/scouting-workflows')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!active) return
        const data = body?.obj as
          | {
              initialized?: boolean
              directive?: string | null
              workflows?: { id: number; label: string; href: string | null }[]
            }
          | undefined
        if (data?.initialized) {
          setWorkflows(
            (data.workflows ?? []).map((w) => ({
              id: String(w.id),
              label: w.label,
              href: w.href ?? undefined,
            })),
          )
          setDirective(
            typeof data.directive === 'string' ? data.directive : DEFAULT_DIRECTIVE,
          )
        } else {
          loadLocal()
        }
      })
      .catch(() => {
        if (active) loadLocal()
      })

    return () => {
      active = false
    }
  }, [])

  const persist = React.useCallback((next: Workflow[], nextDirective: string) => {
    try {
      window.localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next))
      window.localStorage.setItem(DIRECTIVE_KEY, nextDirective)
    } catch {
      /* storage unavailable (private mode) — keep in-memory only */
    }
    // Best-effort server sync, debounced so typing doesn't spam the API.
    // The local copy is always the offline fallback.
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      void fetch('/api/ui/scouting-workflows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflows: next.map((w) => ({ label: w.label, href: w.href ?? null })),
          directive: nextDirective,
        }),
      }).catch(() => {
        /* offline or unauthenticated — local copy persists */
      })
    }, 700)
  }, [])

  // Flush any pending sync timer on unmount.
  React.useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  const commit = React.useCallback(
    (next: Workflow[], nextDirective: string) => {
      setWorkflows(next)
      setDirective(nextDirective)
      persist(next, nextDirective)
    },
    [persist],
  )

  function updateLabel(id: string, label: string) {
    commit(
      workflows.map((w) => (w.id === id ? { ...w, label } : w)),
      directive,
    )
  }

  function removeWorkflow(id: string) {
    commit(
      workflows.filter((w) => w.id !== id),
      directive,
    )
  }

  function addWorkflow() {
    commit([...workflows, { id: newId(), label: 'New scouting step' }], directive)
  }

  function move(id: string, dir: -1 | 1) {
    const idx = workflows.findIndex((w) => w.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= workflows.length) return
    const next = [...workflows]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    commit(next, directive)
  }

  function resetDefaults() {
    commit(DEFAULT_WORKFLOWS, DEFAULT_DIRECTIVE)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Start here
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
            Scouting workflows
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Directive */}
      <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Buddy directive
        </p>
        {editing ? (
          <textarea
            value={directive}
            onChange={(e) => commit(workflows, e.target.value)}
            aria-label="Edit Buddy directive"
            rows={3}
            className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-[#0a0d12] px-3 py-2 text-sm leading-6 text-zinc-200 outline-none transition focus:border-emerald-400/30"
          />
        ) : (
          <p className="mt-3 text-sm leading-6 text-zinc-300">{directive}</p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {workflows.map((task, index) => (
          <div
            key={task.id}
            className="rounded-[22px] border border-white/10 bg-black/20 p-4 transition hover:bg-black/30"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                {index + 1}
              </div>

              {editing ? (
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={task.label}
                    onChange={(e) => updateLabel(task.id, e.target.value)}
                    aria-label={`Edit workflow ${index + 1}`}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0d12] px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-emerald-400/30"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => move(task.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move workflow ${index + 1} up`}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(task.id, 1)}
                      disabled={index === workflows.length - 1}
                      aria-label={`Move workflow ${index + 1} down`}
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeWorkflow(task.id)}
                      aria-label={`Remove workflow ${index + 1}`}
                      className="ml-auto rounded-lg border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <WorkflowItem task={task} />
              )}
            </div>
          </div>
        ))}

        {workflows.length === 0 ? (
          <p className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-500">
            No workflows yet. Add a step to tell Buddy how you want to scout.
          </p>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={addWorkflow}
            className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          >
            + Add step
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
          >
            Reset to defaults
          </button>
        </div>
      ) : null}

      {mounted ? null : (
        <span className="sr-only" aria-live="polite">
          Loading saved workflows…
        </span>
      )}
    </>
  )
}

export default ScoutingWorkflows

// ─── WorkflowItem: direct navigation link ────────────────────────────────────

function WorkflowItem({ task }: { task: Workflow }) {
  return (
    <div className="flex-1 min-w-0">
      {task.href ? (
        <Link href={task.href} className="block text-sm leading-6 text-zinc-300 hover:text-zinc-100 transition-colors">
          {task.label}
        </Link>
      ) : (
        <p className="text-sm leading-6 text-zinc-300">{task.label}</p>
      )}

      {task.href ? (
        <div className="mt-2">
          <Link
            href={task.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            Open
          </Link>
        </div>
      ) : null}
    </div>
  )
}
