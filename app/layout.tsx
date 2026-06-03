import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SidebarNav } from '@/components/layout/SidebarNav';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'NOV8TE — A&R Intelligence', template: '%s | NOV8TE' },
  description: 'Proprietary music intelligence for A&R teams.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://localhost:3000'),
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020817',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#020817] text-slate-100 antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-50 bg-emerald-600 text-white px-3 py-1 rounded text-sm">
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <SidebarNav />
          <main className="flex-1 min-w-0 overflow-x-hidden" id="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
