import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toast'
import { AppShell } from '@/components/layout/AppShell'

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
    process.env.NEXT_PUBLIC_BASE_URL ?? 'https://example.com'
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>{nonce && <meta property="csp-nonce" content={nonce} />}</head>
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-emerald-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black"
        >
          Skip to content
        </a>

        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  )
}
