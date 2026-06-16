'use client'

import Link, { useLinkStatus } from 'next/link'

type QuickTask = {
  /** The action the user is taking. */
  label: string
  /** The destination page title — kept in sync with each section's PageShell title. */
  destination: string
  href: string
}

const QUICK_TASKS: QuickTask[] = [
  { label: 'Scout early UGC breakouts', destination: 'Buddy A&R Scout', href: '/talent-scout' },
  { label: 'Review breaking artists', destination: 'Artist Intelligence', href: '/artists' },
  { label: 'Check genre momentum', destination: 'Genre Breakout Radar', href: '/genres' },
  { label: 'Open my watchlist', destination: 'Watchlist', href: '/watchlist' },
]

/**
 * Home-page quick-action chips.
 *
 * Each chip shows the action plus the destination page title it lands on, so
 * the connection between the chip and the section page is obvious. A spinner
 * appears on the chip while its route loads, giving immediate feedback that a
 * navigation was triggered (BUG-010).
 */
export function QuickTaskChips() {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {QUICK_TASKS.map((task) => (
        <Link
          key={task.href}
          href={task.href}
          aria-label={`${task.label} — opens ${task.destination}`}
          className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-emerald-400/20 hover:bg-white/10"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-zinc-200">
              {task.label}
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              {task.destination}
            </span>
          </span>
          <ChipStatus />
        </Link>
      ))}
    </div>
  )
}

/**
 * Renders the trailing arrow, swapping to a spinner while the enclosing Link is
 * navigating. Must be a descendant of a <Link> so useLinkStatus can read it.
 */
function ChipStatus() {
  const { pending } = useLinkStatus()
  return (
    <span
      className="shrink-0 text-zinc-500 transition group-hover:text-emerald-300"
      aria-hidden="true"
    >
      {pending ? <Spinner /> : <span>→</span>}
    </span>
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
      width="14"
      height="14"
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
