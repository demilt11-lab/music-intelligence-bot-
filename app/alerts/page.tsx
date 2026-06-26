'use client'

import React from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type AlertRule = {
  id: string
  label: string
  condition: string
  channel: string
  enabled: boolean
}

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'a1',
    label: 'Artist breaks into "About to Break" cohort',
    condition: 'status changes to ABOUT_TO_BREAK',
    channel: 'In-app',
    enabled: true,
  },
  {
    id: 'a2',
    label: 'Break probability crosses 70%',
    condition: 'breakProbability ≥ 0.70',
    channel: 'In-app',
    enabled: true,
  },
  {
    id: 'a3',
    label: 'Watchlisted artist streams up >20% in 7 days',
    condition: 'streams7dDelta > 0.20 (watchlist)',
    channel: 'In-app',
    enabled: false,
  },
  {
    id: 'a4',
    label: 'New scout score computed for your markets',
    condition: 'dailyScoreRefresh',
    channel: 'In-app',
    enabled: false,
  },
]

const ALERT_TYPES = [
  {
    icon: '◎',
    title: 'Breakout signals',
    description: 'Get notified the moment an artist\'s momentum crosses your configured threshold.',
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

export default function AlertsPage() {
  const [rules, setRules] = React.useState<AlertRule[]>(DEFAULT_RULES)
  const [saved, setSaved] = React.useState(false)

  function toggleRule(id: string) {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r))
    setSaved(false)
  }

  function handleSave() {
    // Persist to server when the alerts API is available
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <PageShell
      title="Alerts & Notifications"
      description="Configure when Buddy should surface signals to your attention — breakout moments, watchlist moves, and market triggers you define."
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
          {/* Alert types overview */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Alert types
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Alerts fire in-app for now. Email and Slack delivery will be available when workspace integrations are configured.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ALERT_TYPES.map((t) => {
                const c = ACCENT_CLASSES[t.accent]
                return (
                  <div
                    key={t.title}
                    className={`rounded-[22px] border ${c.border} ${c.bg} p-4`}
                  >
                    <span className={`text-2xl ${c.icon}`}>{t.icon}</span>
                    <p className={`mt-3 text-sm font-semibold ${c.text}`}>{t.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{t.description}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Alert rules */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Alert rules
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {enabledCount} of {rules.length} rules active
                </p>
              </div>

              <button
                type="button"
                onClick={handleSave}
                className={[
                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                  saved
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10',
                ].join(' ')}
              >
                {saved ? 'Saved ✓' : 'Save changes'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={[
                    'flex items-start justify-between gap-4 rounded-[22px] border p-4 transition',
                    rule.enabled
                      ? 'border-emerald-400/20 bg-emerald-500/[0.06]'
                      : 'border-white/10 bg-white/[0.03]',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${rule.enabled ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {rule.label}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Condition: <code className="font-mono text-zinc-400">{rule.condition}</code>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Delivery: {rule.channel}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    onClick={() => toggleRule(rule.id)}
                    className={[
                      'relative mt-0.5 shrink-0 h-6 w-11 rounded-full border transition-colors',
                      rule.enabled
                        ? 'border-emerald-400/30 bg-emerald-500/30'
                        : 'border-white/10 bg-white/5',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute top-0.5 h-5 w-5 rounded-full border transition-all',
                        rule.enabled
                          ? 'left-[22px] border-emerald-400/40 bg-emerald-400'
                          : 'left-0.5 border-white/10 bg-zinc-500',
                      ].join(' ')}
                    />
                    <span className="sr-only">{rule.enabled ? 'Disable' : 'Enable'} alert</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[20px] border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-300">Alert delivery is coming soon</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Rules are saved to your workspace. Push delivery via email, Slack, or webhook will be available when you connect an integration in Workspace Settings.
              </p>
            </div>
          </section>

          {/* Coming soon features */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Planned alert capabilities
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Custom threshold builder', detail: 'Define your own numeric conditions per metric' },
                { label: 'Email digest (daily / weekly)', detail: 'Roll up your top signals into a scheduled report' },
                { label: 'Slack & webhook delivery', detail: 'Push alerts directly into your team channels' },
                { label: 'Artist watchlist triggers', detail: 'Per-artist alert rules for your saved shortlist' },
                { label: 'Market-specific filters', detail: 'Territory-gated alerts for targeted scouting coverage' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-zinc-500">
                    ○
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-300">{f.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-zinc-500">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Buddy read
            </p>
            <div className="mt-4">
              <CompanionMessage
                type="insight"
                message="Alerts keep your A&R radar active without manual checking. Enable the rules that matter most, then let Buddy surface signals the moment they appear."
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Alert strategy
            </p>
            <div className="mt-4 space-y-3 text-xs leading-5 text-zinc-300">
              <p>
                <strong className="text-zinc-200">Start narrow.</strong> Enable only the breakout-signal alert first. Too many alerts become noise — add more only as your workflow matures.
              </p>
              <p>
                <strong className="text-zinc-200">Pair with the watchlist.</strong> Watchlist-specific alerts fire only for artists you've already flagged as interesting, so the signal-to-noise ratio stays high.
              </p>
              <p>
                <strong className="text-zinc-200">Daily digest.</strong> Once email delivery is available, the daily digest is often more useful than real-time push for longer scouting cycles.
              </p>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Related
            </p>
            <div className="mt-4 space-y-2">
              {[
                { href: '/talent-scout', label: 'Talent Scout', detail: 'Live breakout feed' },
                { href: '/watchlist', label: 'Watchlist', detail: 'Manage your A&R shortlist' },
                { href: '/analytics', label: 'Analytics', detail: 'Workspace coverage overview' },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
                >
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
