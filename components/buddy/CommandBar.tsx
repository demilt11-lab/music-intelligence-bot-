'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Home-page "Command Buddy" bar.
 *
 * Routes a free-text query into the discovery search page. The "Run task"
 * button stays disabled while the input is empty — with an inline hint
 * explaining what to enter — and switches to a spinner while the search
 * route loads, so the action never silently does nothing (BUG-009).
 */
export function CommandBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const trimmed = query.trim()
  const isEmpty = trimmed.length === 0
  const disabled = isEmpty || loading

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isEmpty || loading) return
    setLoading(true)
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4"
    >
      <div className="flex min-h-[120px] flex-col justify-between gap-4">
        <p className="text-sm leading-7 text-zinc-300">
          What do you want me to scout today?
        </p>

        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search an artist, track, writer, or playlist…"
              className="flex-1 rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-emerald-400/30"
              aria-label="Search the music intelligence graph"
              aria-describedby={isEmpty ? 'command-bar-hint' : undefined}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={disabled}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/10"
            >
              {loading ? (
                <>
                  <Spinner />
                  Running…
                </>
              ) : (
                'Run task'
              )}
            </button>
          </div>

          {isEmpty ? (
            <p id="command-bar-hint" className="text-xs leading-5 text-zinc-500">
              Enter an artist, track, or keyword to run a task.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="15"
      height="15"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
