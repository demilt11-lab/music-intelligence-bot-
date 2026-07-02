'use client'

import React from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type AlertRule = {
  id: number
  entityType: 'track' | 'artist' | 'watchlist'
  entityId: number | null
  metric: 'viralScore' | 'breakProbability' | 'streams7dDelta'
  operator: 'gt' | 'lt'
  threshold: number
  channel: 'email' | 'webhook'
  destination: string
  isActive: boolean
  lastFiredAt: string | null
  createdAt: string
}

const ALERT_TYPES = [
  {
    icon: '◎',
    title: 'Breakout signals',
    description: "Get notified the moment an artist's momentum crosses your configured threshold.",
    accent: 'emerald',
  },
  {
    icon: '◈',
    title: 'Watchlist moves',
    description: 'Monitor trajectory changes — growing, declining, or breaking — for saved artists.',
    accent: 'cyan',
  },
  {
    icon: '⌕',
    title: 'New scout scores',
    description: 'Alert when daily ML scores update so you can review the freshest signals first.',
    accent: 'violet',
  },
  {
    icon: '⇆',
    title: 'Market triggers',
    description: 'Region-specific alerts when a territory shows unusual UGC or playlist activity.',
    accent: 'amber',
  },
]

const ACCENT_CLASSES: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  emerald: { border: 'border-emerald-400/20', bg: 'bg-emerald-500/10', text: 'text-emerald-300', icon: 'text-emerald-400' },
  cyan: { border: 'border-cyan-400/20', bg: 'bg-cyan-500/10', text: 'text-cyan-300', icon: 'text-cyan-400' },
  violet: { border: 'border-violet-400/20', bg: 'bg-violet-500/10', text: 'text-violet-300', icon: 'text-violet-400' },
  amber: { border: 'border-amber-400/20', bg: 'bg-amber-500/10', text: 'text-amber-300', icon: 'text-amber-400' },
}

const METRIC_LABELS: Record<AlertRule['metric'], string> = {
  viralScore: 'Viral score',
  breakProbability: 'Break probability',
  streams7dDelta: 'Streams (7d change)',
}

const ENTITY_LABELS: Record<AlertRule['entityType'], string> = {
  track: 'Track',
  artist: 'Artist',
  watchlist: 'Anything on your watchlist',
}

function describeRule(rule: AlertRule): string {
  const entity =
    rule.entityType === 'watchlist'
      ? ENTITY_LABELS.watchlist
      : `${ENTITY_LABELS[rule.entityType]} #${rule.entityId}`
  const op = rule.operator === 'gt' ? 'rises above' : 'falls below'
  return `${entity} — ${METRIC_LABELS[rule.metric]} ${op} ${rule.threshold}`
}

const emptyForm = {
  entityType: 'watchlist' as AlertRule['entityType'],
  entityId: '',
  metric: 'breakProbability' as AlertRule['metric'],
  operator: 'gt' as AlertRule['operator'],
  threshold: '',
  channel: 'email' as AlertRule['channel'],
  destination: '',
}

export default function AlertsPage() {
  const [rules, setRules] = React.useState<AlertRule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [needsAuth, setNeedsAuth] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setNeedsAuth(false)
    setLoadError(null)
    try {
      const res = await fetch('/api/ui/alerts')
      if (res.status === 401) {
        setNeedsAuth(true)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Request failed (${res.status})`)
      }
      const json = (await res.json()) as { obj: AlertRule[] }
      setRules(json.obj)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load alert rules')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function toggleRule(rule: AlertRule) {
    setBusyId(rule.id)
    try {
      const res = await fetch(`/api/ui/alerts/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to update rule')
      const json = (await res.json()) as { obj: AlertRule }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? json.obj : r)))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to update rule')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteRule(rule: AlertRule) {
    setBusyId(rule.id)
    try {
      const res = await fetch(`/api/ui/alerts/${rule.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to delete rule')
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to delete rule')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const threshold = Number(form.threshold)
    if (!Number.isFinite(threshold)) {
      setFormError('Threshold must be a number')
      return
    }
    if (form.entityType !== 'watchlist' && !form.entityId.trim()) {
      setFormError(`Enter the ${form.entityType} ID (visible in its page URL) to alert on a specific ${form.entityType}`)
      return
    }
    if (!form.destination.trim()) {
      setFormError(form.channel === 'email' ? 'Enter an email address' : 'Enter a webhook URL')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/ui/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: form.entityType,
          entityId: form.entityType === 'watchlist' ? null : Number(form.entityId),
          metric: form.metric,
          operator: form.operator,
          threshold,
          channel: form.channel,
          destination: form.destination.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to create alert rule')
      }
      const json = (await res.json()) as { obj: AlertRule }
      setRules((prev) => [json.obj, ...prev])
      setForm(emptyForm)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create alert rule')
    } finally {
      setSubmitting(false)
    }
  }

  const enabledCount = rules.filter((r) => r.isActive).length

  if (needsAuth) {
    return (
      <PageShell title="Alerts & Notifications" description="Sign in to configure alerts for your workspace.">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
          <CompanionMessage type="warning" message="Sign in to view and manage your alert rules." />
          <div className="mt-4">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Sign in
            </Link>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Alerts & Notifications"
      description="Configure real, delivered alerts — email or webhook — that fire when a metric you define crosses a threshold."
      actions={
        <Link
          href="/watchlist"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
        >
          View watchlist
        </Link>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Alert types</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ALERT_TYPES.map((t) => {
                const c = ACCENT_CLASSES[t.accent]
                return (
                  <div key={t.title} className={`rounded-[22px] border ${c.border} ${c.bg} p-4`}>
                    <span className={`text-2xl ${c.icon}`}>{t.icon}</span>
                    <p className={`mt-3 text-sm font-semibold ${c.text}`}>{t.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{t.description}</p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">New alert rule</p>
            <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Watch
                <select
                  value={form.entityType}
                  onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value as AlertRule['entityType'] }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="watchlist">Anything on my watchlist</option>
                  <option value="artist">A specific artist</option>
                  <option value="track">A specific track</option>
                </select>
              </label>

              {form.entityType !== 'watchlist' && (
                <label className="flex flex-col gap-1 text-xs text-zinc-400">
                  {form.entityType === 'artist' ? 'Artist ID' : 'Track ID'}
                  <input
                    value={form.entityId}
                    onChange={(e) => setForm((f) => ({ ...f, entityId: e.target.value }))}
                    placeholder="From the page URL, e.g. 42"
                    inputMode="numeric"
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Metric
                <select
                  value={form.metric}
                  onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as AlertRule['metric'] }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="breakProbability">Break probability</option>
                  <option value="viralScore">Viral score</option>
                  <option value="streams7dDelta">Streams (7d change)</option>
                </select>
              </label>

              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
                  Condition
                  <select
                    value={form.operator}
                    onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as AlertRule['operator'] }))}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="gt">rises above</option>
                    <option value="lt">falls below</option>
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-400">
                  Threshold
                  <input
                    value={form.threshold}
                    onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                    placeholder="0.70"
                    inputMode="decimal"
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Delivery
                <select
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as AlertRule['channel'] }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                {form.channel === 'email' ? 'Email address' : 'Webhook URL'}
                <input
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  placeholder={form.channel === 'email' ? 'you@label.com' : 'https://hooks.example.com/…'}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </label>

              {formError && (
                <p className="sm:col-span-2 text-xs text-rose-400">{formError}</p>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create alert'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Your alert rules</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {loading ? 'Loading…' : `${enabledCount} of ${rules.length} rules active`}
                </p>
              </div>
            </div>

            {loadError && <p className="mt-3 text-xs text-rose-400">{loadError}</p>}

            <div className="mt-4 space-y-3">
              {!loading && rules.length === 0 && (
                <p className="text-sm text-zinc-500">No alert rules yet. Create one above.</p>
              )}
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={[
                    'flex items-start justify-between gap-4 rounded-[22px] border p-4 transition',
                    rule.isActive ? 'border-emerald-400/20 bg-emerald-500/[0.06]' : 'border-white/10 bg-white/[0.03]',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${rule.isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {describeRule(rule)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Delivery: {rule.channel === 'email' ? `Email — ${rule.destination}` : `Webhook — ${rule.destination}`}
                    </p>
                    {rule.lastFiredAt && (
                      <p className="mt-0.5 text-xs text-zinc-600">
                        Last fired {new Date(rule.lastFiredAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.isActive}
                      disabled={busyId === rule.id}
                      onClick={() => toggleRule(rule)}
                      className={[
                        'relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50',
                        rule.isActive ? 'border-emerald-400/30 bg-emerald-500/30' : 'border-white/10 bg-white/5',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'absolute top-0.5 h-5 w-5 rounded-full border transition-all',
                          rule.isActive ? 'left-[22px] border-emerald-400/40 bg-emerald-400' : 'left-0.5 border-white/10 bg-zinc-500',
                        ].join(' ')}
                      />
                      <span className="sr-only">{rule.isActive ? 'Disable' : 'Enable'} alert</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === rule.id}
                      onClick={() => deleteRule(rule)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-rose-400/30 hover:text-rose-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Planned alert capabilities</p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'In-app + Slack delivery', detail: 'Push alerts directly into the product and your team channels' },
                { label: 'Status-transition triggers', detail: 'Fire when an artist crosses into a new trajectory cohort, not just a numeric threshold' },
                { label: 'Entity picker', detail: 'Search for a track or artist instead of entering its ID by hand' },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-zinc-500">○</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-300">{f.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-zinc-500">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Buddy read</p>
            <div className="mt-4">
              <CompanionMessage
                type="insight"
                message="Alerts fire on a schedule (checked periodically, not instantly), and each rule has a 24-hour cooldown once triggered so you don't get paged twice for the same move."
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Alert strategy</p>
            <div className="mt-4 space-y-3 text-xs leading-5 text-zinc-300">
              <p><strong className="text-zinc-200">Start narrow.</strong> One or two rules on your watchlist beat a dozen rules you&rsquo;ll end up ignoring.</p>
              <p><strong className="text-zinc-200">Pair with the watchlist.</strong> &ldquo;Anything on my watchlist&rdquo; rules only fire for artists you&rsquo;ve already flagged as interesting.</p>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Related</p>
            <div className="mt-4 space-y-2">
              {[
                { href: '/talent-scout', label: 'Talent Scout', detail: 'Live breakout feed' },
                { href: '/watchlist', label: 'Watchlist', detail: 'Manage your A&R shortlist' },
                { href: '/analytics', label: 'Analytics', detail: 'Workspace coverage overview' },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]">
                  <p className="text-sm font-medium text-zinc-200">{l.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{l.detail}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
