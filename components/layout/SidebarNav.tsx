'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/talent-scout', label: 'A&R Radar', icon: '◎', hot: true },
  { href: '/artists', label: 'Artists', icon: '♪' },
  { href: '/tracks', label: 'Tracks', icon: '♫' },
  { href: '/playlists', label: 'Playlists', icon: '▤' },
  { href: '/curators', label: 'Curators', icon: '✦' },
  { href: '/watchlist', label: 'Watchlist', icon: '◈' },
  { href: '/search', label: 'Search', icon: '⌕' },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 min-h-screen border-r border-slate-800/60 bg-[#020817] flex flex-col">
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <span className="text-emerald-400 text-xs font-bold">N</span>
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight">NOV8TE</div>
            <div className="text-[10px] text-slate-500 leading-none">A&R Intelligence</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon, hot }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <span className={`text-base leading-none ${active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {icon}
              </span>
              <span className="flex-1">{label}</span>
              {hot && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-label="Active feature" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] text-slate-500">ML pipeline active</span>
        </div>
      </div>
    </aside>
  );
}
