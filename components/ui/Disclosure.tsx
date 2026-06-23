'use client'

import React from 'react'

/**
 * Progressive-disclosure primitive: shows a summary line with the detail
 * content tucked behind an accessible toggle. Used to make data-dense surfaces
 * summary-first (QA: "interface is too data-driven") without hiding the
 * headline read.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  className = '',
  children,
}: {
  summary: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const id = React.useId()

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
      >
        <span>{summary}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div id={id} className="mt-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export default Disclosure
