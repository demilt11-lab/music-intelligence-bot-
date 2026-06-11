'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(body?.error ?? `Login failed (${res.status})`)
      }

      const next = searchParams.get('next')
      router.push(next && next.startsWith('/') ? next : '/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070a] px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.16),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.10),transparent_26%)]" />

      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
          NOV8TE
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Buddy A&R</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Sign in to your music intelligence workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-400/30"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-medium text-zinc-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-emerald-400/30"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs leading-5 text-zinc-500">
          Access is provisioned by your workspace admin
          (<code className="text-zinc-400">npm run create-user</code>).
        </p>
      </div>
    </main>
  )
}
