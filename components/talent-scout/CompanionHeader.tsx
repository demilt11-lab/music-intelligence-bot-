'use client'

import React from 'react'

interface CompanionHeaderProps {
  trackCount: number
  hotCount: number
  mode: 'ugc_early' | 'general'
  code2: string
  onModeChange: (m: 'ugc_early' | 'general') => void
  onMarketChange: (m: string) => void
  onRefresh: () => void
  isLoading: boolean
}

function buildMessage(trackCount: number, hotCount: number, code2: string): string {
  if (trackCount === 0) {
    return "I'm scanning for breakout artists and records right now. New signals will surface here as soon as momentum starts building."
  }

  const market = code2 === 'GLOBAL' ? 'globally' : `in ${code2}`

  if (hotCount > 0) {
    return `I found ${trackCount} tracks worth watching ${market}. ${hotCount} ${
      hotCount === 1 ? 'is' : 'are'
    } flashing strong breakout potential right now.`
  }

  return `I'm monitoring ${trackCount} active tracks ${market}. Nothing is fully breaking yet, but several records are showing early movement worth tracking.`
}

function formatModeLabel(mode: 'ugc_early' | 'general') {
  return mode === 'ugc_early' ? 'Early UGC Breakouts' : 'General Momentum'
}

const markets = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'BR', label: 'Brazil' },
] as const

export function CompanionHeader({
  trackCount,
  hotCount,
  mode,
  code2,
  onModeChange,
  onMarketChange,
  onRefresh,
  isLoading,
}: CompanionHeaderProps) {
  const message = buildMessage(trackCount, hotCount, code2)

  const currentTime = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <section className="sticky top-0 z-20">
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,14,0.88),rgba(12,12,14,0.72))] shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative mt-0.5 shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_30%_30%,rgba(52,211,153,0.22),rgba(16,185,129,0.08)_45%,rgba(255,255,255,0.02)_100%)] shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                  <span className="text-lg text-emerald-300" aria-hidden>
                    ◎
                  </span>
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b0b0d] bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
                  aria-label="Buddy online"
                />
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    Buddy A&R Scout
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {isLoading ? 'Scanning live…' : `Updated ${currentTime}`}
                  </span>
                </div>

                <p className="max-w-3xl text-sm leading-6 text-zinc-200">{message}</p>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    Mode: {formatModeLabel(mode)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    Market: {markets.find((m) => m.value === code2)?.label ?? code2}
                  </span>

                  {trackCount > 0 ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      {trackCount} active signals
                    </span>
                  ) : null}

                  {hotCount > 0 ? (
                    <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-300">
                      {hotCount} breakout alerts
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Refresh scout data"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isLoading ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>

          <div
            className="grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[auto_auto_1fr]"
            role="group"
            aria-label="Scout controls"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Scout lens
              </span>
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                {(['ugc_early', 'general'] as const).map((m) => {
                  const active = mode === m

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onModeChange(m)}
                      aria-pressed={active}
                      className={[
                        'rounded-full px-3 py-1.5 text-xs font-medium transition',
                        active
                          ? 'bg-emerald-500 text-black shadow-[0_8px_24px_rgba(16,185,129,0.28)]'
                          : 'text-zinc-300 hover:bg-white/8 hover:text-white',
                      ].join(' ')}
                    >
                      {m === 'ugc_early' ? 'Early UGC' : 'General'}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="market-select"
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500"
              >
                Market
              </label>
              <select
                id="market-select"
                value={code2}
                onChange={(e) => onMarketChange(e.target.value)}
                aria-label="Select market"
                className="min-w-[190px] rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 outline-none transition focus:border-emerald-400/30 focus:bg-white/10"
              >
                {markets.map((market) => (
                  <option key={market.value} value={market.value}>
                    {market.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {['Breakout velocity', 'Playlist fit', 'Artist consistency'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CompanionHeader
