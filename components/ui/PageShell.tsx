'use client'

import React from 'react'

type PageShellProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen text-zinc-50">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92)_0%,rgba(10,10,11,0.94)_100%)] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(34,197,94,0.10),transparent_22%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

          <div className="relative flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  Buddy Mode Active
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
                    {title}
                  </h1>

                  {description && (
                    <p className="max-w-3xl text-sm leading-6 text-zinc-300 sm:text-[15px]">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center xl:justify-end">
                <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Watchlist
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">128</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">
                      Breakout Signals
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">17</p>
                  </div>
                </div>

                {actions && <div className="flex items-center gap-2">{actions}</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="relative">
          {children}
        </section>
      </main>
    </div>
  )
}
