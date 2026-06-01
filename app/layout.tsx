import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'NOV8TE — A&R Intelligence Platform',
    template: '%s | NOV8TE',
  },
  description:
    'Proprietary music intelligence for A&R teams. ML breakout predictions, cross-platform velocity signals, and rights complexity scoring.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://localhost:3000'),
  openGraph: {
    type: 'website',
    siteName: 'NOV8TE',
    title: 'NOV8TE — A&R Intelligence Platform',
    description: 'Music intelligence for A&R teams. Spot breakout artists 4–8 weeks early.',
  },
  robots: { index: false, follow: false }, // internal tool
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-50 bg-emerald-600 text-white px-3 py-1 rounded text-sm"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <aside className="w-56 border-r border-slate-800 min-h-screen p-4 space-y-3 shrink-0">
            <div className="text-sm font-bold text-emerald-400 tracking-tight">NOV8TE</div>
            <nav className="flex flex-col gap-1 text-sm" aria-label="Main navigation">
              <NavLink href="/">Home</NavLink>
              <NavLink href="/talent-scout">A&amp;R Radar</NavLink>
              <NavLink href="/artists">Artists</NavLink>
              <NavLink href="/tracks">Tracks</NavLink>
              <NavLink href="/playlists">Playlists</NavLink>
              <NavLink href="/curators">Curators</NavLink>
              <NavLink href="/watchlist">Watchlist</NavLink>
              <NavLink href="/search">Search</NavLink>
            </nav>
          </aside>
          <main className="flex-1 min-w-0" id="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors duration-150"
    >
      {children}
    </Link>
  );
}
