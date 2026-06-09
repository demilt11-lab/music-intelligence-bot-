import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { ToastProvider } from '@/components/ui/Toast'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'NOV8TE Buddy — A&R Intelligence',
    template: '%s | NOV8TE Buddy',
  },
  description:
    'AI-powered A&R intelligence workspace for scouting artists, tracking momentum, and turning music data into actionable decisions.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? 'https://localhost:3000'
  ),
  robots: {
    index: false,
    follow: false,
  },
  applicationName: 'NOV8TE Buddy',
  keywords: [
    'A&R intelligence',
    'music analytics',
    'artist scouting',
    'music industry software',
    'AI music assistant',
    'playlist intelligence',
    'viral music detection',
  ],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-emerald-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black"
        >
          Skip to content
        </a>

        <ToastProvider>
          <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.08),_transparent_22%),linear-gradient(180deg,_#0a0a0b_0%,_#0d0f14_45%,_#0a0a0b_100%)]">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.18)_100%)]" />

            <div className="relative flex min-h-screen">
              <SidebarNav />
              <main
                id="main-content"
                className="relative flex-1 min-w-0 overflow-x-hidden"
              >
                <div className="min-h-screen">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
