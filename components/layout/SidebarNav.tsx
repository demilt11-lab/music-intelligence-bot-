'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/talent-scout', label: 'Buddy Scout', icon: '◎', hot: true },
  { href: '/ar-bot', label: 'A&R Bot', icon: '❖', hot: true },
  { href: '/artists', label: 'Artists', icon: '♪' },
  { href: '/playlists', label: 'Playlists', icon: '▤' },
  { href: '/curators', label: 'Curators', icon: '✦' },
  { href: '/watchlist', label: 'Watchlist', icon: '◈' },
  { href: '/search', label: 'Search', icon: '⌕' },
]

const ADMIN_NAV_ITEMS = [
  { href: '/settings/api-keys', label: 'API Keys', icon: '⚿', hot: false },
]

export function SidebarNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.obj?.role === 'ADMIN') setIsAdmin(true)
      })
      .catch(() => {})
  }, [])

  const navItems = isAdmin ? [...BASE_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : BASE_NAV_ITEMS

  return (
    <aside className="hidden min-h-screen w-[288px] shrink-0 border-r border-white/10 bg-[linear-gradient(180deg,rgba(7,7,9,0.96)_0%,rgba(11,12,16,0.98)_100%)] xl:flex xl:flex-col">
      <div className="border-b border-white/10 px-5 pb-5 pt-6">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_30%_30%,rgba(52,211,153,0.18),rgba(16,185,129,0.06)_45%,rgba(255,255,255,0.02)_100%)] shadow-[0_0_30px_rgba(16,185,129,0.12)]">
              <span className="text-sm font-semibold text-emerald-300">N</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a0b] bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              NOV8TE
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.03em] text-white">
              Buddy A&R
            </h2>
            <p className="mt-1 text-sm leading-5 text-zinc-400">
              Music intelligence workspace for scouting breakout records and artist momentum.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Session
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-xs text-zinc-400">Mode</span>
              <span className="text-xs font-medium text-emerald-300">Live Scout</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-xs text-zinc-400">Status</span>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                Online
              </span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-4" aria-label="Main navigation">
        <div className="mb-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-600">
            Workspace
          </p>
        </div>

        <div className="space-y-1.5">
          {navItems.map(({ href, label, icon, hot }) => {
            const active =
              pathname === href || (href !== '/' && pathname.startsWith(href))

            return (
              <Link
                key={href}
                href={href}
                className={[
                  'group flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-all duration-200',
                  active
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-white shadow-[0_12px_32px_rgba(16,185,129,0.12)]'
                    : 'border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-zinc-100',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm transition',
                    active
                      ? 'border-emerald-400/20 bg-emerald-500/12 text-emerald-300'
                      : 'border-white/8 bg-white/[0.03] text-zinc-500 group-hover:text-zinc-200',
                  ].join(' ')}
                  aria-hidden
                >
                  {icon}
                </span>

                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>

                {hot ? (
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      active ? 'bg-emerald-400' : 'bg-emerald-500/70'
                    } shadow-[0_0_12px_rgba(52,211,153,0.75)]`}
                    aria-label="Active feature"
                  />
                ) : null}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Pipeline health
          </p>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">ML signal pipeline</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Ingest, ranking, and recommendation systems are active.
              </p>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
              Healthy
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default SidebarNav
