import React from 'react'

interface CompanionMessageProps {
  message: string
  type?: 'insight' | 'action' | 'warning' | 'info'
  compact?: boolean
  className?: string
}

const TYPE_CONFIG = {
  insight: {
    border: 'border-emerald-400/20',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    iconWrap: 'bg-emerald-500/14 border-emerald-400/20',
    icon: '◎',
    label: 'Insight',
  },
  action: {
    border: 'border-cyan-400/20',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-200',
    iconWrap: 'bg-cyan-500/14 border-cyan-400/20',
    icon: '→',
    label: 'Action',
  },
  warning: {
    border: 'border-amber-400/20',
    bg: 'bg-amber-500/10',
    text: 'text-amber-200',
    iconWrap: 'bg-amber-500/14 border-amber-400/20',
    icon: '!',
    label: 'Watchout',
  },
  info: {
    border: 'border-white/10',
    bg: 'bg-white/5',
    text: 'text-zinc-300',
    iconWrap: 'bg-white/8 border-white/10',
    icon: '·',
    label: 'Note',
  },
} as const

export function CompanionMessage({
  message,
  type = 'info',
  compact = false,
  className = '',
}: CompanionMessageProps) {
  const cfg = TYPE_CONFIG[type]

  if (compact) {
    return (
      <p
        className={`flex items-start gap-2 text-xs leading-6 ${cfg.text} ${className}`}
        role="note"
      >
        <span
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${cfg.iconWrap}`}
          aria-hidden
        >
          {cfg.icon}
        </span>
        <span>{message}</span>
      </p>
    )
  }

  return (
    <div
      className={`rounded-[18px] border ${cfg.border} ${cfg.bg} px-4 py-3 ${className}`}
      role="note"
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${cfg.iconWrap} ${cfg.text}`}
          aria-hidden
        >
          {cfg.icon}
        </span>

        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {cfg.label}
          </p>
          <p className={`mt-1 text-sm leading-6 ${cfg.text}`}>{message}</p>
        </div>
      </div>
    </div>
  )
}

export default CompanionMessage
