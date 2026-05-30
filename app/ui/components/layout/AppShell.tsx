// app/ui/components/layout/AppShell.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';

type AppShellProps = {
  children: React.ReactNode;
  nav?: React.ReactNode;
};

export function AppShell({ children, nav }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2
                   focus:bg-slate-900 focus:text-white focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <span className="font-semibold tracking-tight">
              Music Intelligence
            </span>
          </Link>
          {nav ?? (
            <nav aria-label="Primary" className="flex gap-4 text-sm text-slate-300">
              <Link href="/search" className="hover:text-white">
                Search
              </Link>
              <Link href="/tracks" className="hover:text-white">
                Tracks
              </Link>
              <Link href="/songwriters" className="hover:text-white">
                Songwriters
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}// app/ui/components/layout/AppShell.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';

type AppShellProps = {
  children: React.ReactNode;
  nav?: React.ReactNode;
};

export function AppShell({ children, nav }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2
                   focus:bg-slate-900 focus:text-white focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <span className="font-semibold tracking-tight">
              Music Intelligence
            </span>
          </Link>
          {nav ?? (
            <nav aria-label="Primary" className="flex gap-4 text-sm text-slate-300">
              <Link href="/search" className="hover:text-white">
                Search
              </Link>
              <Link href="/tracks" className="hover:text-white">
                Tracks
              </Link>
              <Link href="/songwriters" className="hover:text-white">
                Songwriters
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
