'use client'

import React from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

const KPI_CARDS = [
  {
    label: 'Active watchlist',
    value: '128',
    detail: 'Artists, writers, and producers under active review',
  },
  {
    label: 'Breakout signals',
    value: '17',
    detail: 'High-priority momentum shifts surfaced today',
  },
  {
    label: 'Open scouting tasks',
    value: '9',
    detail: 'Buddy assignments waiting for deeper analysis',
  },
  {
    label: 'Markets monitored',
    value: '8',
    detail: 'Priority territories across global A&R coverage',
  },
]

const MARKET_ROWS = [
  { market: 'US', momentum: 'High', focus: 'Pop crossover and producer movement' },
  { market: 'UK', momentum: 'Rising', focus: 'Alternative, dance, and songwriter traction' },
  { market: 'Brazil', momentum: 'Rising', focus: 'Regional breakout acceleration' },
  { market: 'Global', momentum: 'Mixed', focus: 'Cross-platform trend validation' },
]

const TEAM_FEED = [
  'Three artists moved from early signal to priority review in the last 24 hours.',
  'Playlist-to-UGC conversion is strongest on current pop and alt records.',
  'Buddy is surfacing writer and producer signals earlier than traditional dashboard flows.',
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

export default function AnalyticsPage() {
  return (
    <PageShell
      title="Analytics"
      description="A strategic overview of scouting volume, market movement, breakout pressure, and the signals Buddy is prioritizing across the music intelligence workspace."
      actions={<AnalyticsHeroActions />}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Workspace overview
                  </p>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
                    Buddy’s current intelligence footprint
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-zinc-300">
                    This page gives you a top-line read on scouting pressure, active
                    opportunities, and where deeper review should happen next.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Status
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      Live overview
                    </p>
                  </div>
                  <ScoreRing score={0.72} size={58} label="System confidence 72" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {KPI_CARDS.map((card) => (
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
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Market pressure
              </p>
              <div className="mt-4 space-y-3">
                {MARKET_ROWS.map((row) => (
                  <div
                    key={row.market}
                    className="flex flex-col gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{row.market}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">{row.focus}</p>
                    </div>

                    <span
                      className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                        row.momentum === 'High'
                          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                          : row.momentum === 'Rising'
                            ? 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                            : 'border-white/10 bg-white/5 text-zinc-300'
                      }`}
                    >
                      {row.momentum}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Buddy guidance
              </p>
              <div className="mt-4 space-y-3">
                <CompanionMessage
                  type="insight"
                  message="Start in Talent Scout when you need urgent breakout triage. Use this overview to decide where the team’s attention should go next."
                />
                <CompanionMessage
                  type="action"
                  message="Use Search and route-specific pages to validate specific artists, tracks, playlists, and collaborators after top-line signals are identified."
                />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Team feed
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
                  What Buddy is seeing right now
                </h2>
              </div>

              <Link
                href="/watchlist"
                className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                Open watchlist
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {TEAM_FEED.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-zinc-300">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
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
              Notes
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
              <p>
                This first version is intentionally a strategic overview page rather than a fully
                wired BI dashboard.
              </p>
              <p>
                It gives the homepage a valid destination now, while leaving room for real charts,
                filters, and live metric integrations later.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
