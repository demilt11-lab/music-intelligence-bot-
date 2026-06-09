import React from 'react'

interface PlatformBarProps {
  platform: 'tiktok' | 'spotify' | 'youtube' | 'instagram' | 'luminate' | 'shazam'
  value: string | number | null
  secondaryValue?: string | null
  maxValue?: number
  className?: string
}

const PLATFORM_CONFIG = {
  tiktok: {
    label: 'TikTok',
    color: '#fbbf24',
    soft: 'rgba(251, 191, 36, 0.12)',
    icon: '♪',
  },
  spotify: {
    label: 'Spotify',
    color: '#22c55e',
    soft: 'rgba(34, 197, 94, 0.12)',
    icon: '♫',
  },
  youtube: {
    label: 'YouTube',
    color: '#ef4444',
    soft: 'rgba(239, 68, 68, 0.12)',
    icon: '▶',
  },
  instagram: {
    label: 'Instagram',
    color: '#c084fc',
    soft: 'rgba(192, 132, 252, 0.12)',
    icon: '◈',
  },
  luminate: {
    label: 'Luminate',
    color: '#60a5fa',
    soft: 'rgba(96, 165, 250, 0.12)',
    icon: '◉',
  },
  shazam: {
    label: 'Shazam',
    color: '#38bdf8',
    soft: 'rgba(56, 189, 248, 0.12)',
    icon: '✦',
  },
} as const

function formatValue(v: string | number | null): string {
  if (v == null || v === '' || v === '0' || v === 0) return '—'

  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`

  return n.toLocaleString()
}

function barWidth(v: string | number | null, max: number): number {
  const n = Number(v ?? 0)
  if (!n || !max) return 0
  return Math.min(100, (Math.log10(n + 1) / Math.log10(max + 1)) * 100)
}

export function PlatformBar({
  platform,
  value,
  secondaryValue,
  maxValue = 10_000_000,
  className = '',
}: PlatformBarProps) {
  const cfg = PLATFORM_CONFIG[platform]
  const display = formatValue(value)
  const hasData = display !== '—'
  const width = hasData ? barWidth(value, maxValue) : 0
  const velocity = secondaryValue != null && secondaryValue !== '0' ? Number(secondaryValue) : null
  const showVelocity = velocity != null && !Number.isNaN(velocity)

  return (
    <div
      className={`rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs"
          style={{
            color: cfg.color,
            background: cfg.soft,
            borderColor: cfg.soft,
          }}
          aria-hidden
        >
          {cfg.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              {cfg.label}
            </span>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-medium tabular-nums ${
                  hasData ? 'text-zinc-200' : 'text-zinc-600'
                }`}
              >
                {display}
              </span>

              {showVelocity && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                    velocity > 0
                      ? 'bg-emerald-500/12 text-emerald-300'
                      : 'bg-white/6 text-zinc-500'
                  }`}
                >
                  {velocity > 0 ? '+' : ''}
                  {velocity.toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${width}%`,
                background: `linear-gradient(90deg, ${cfg.color}, rgba(255,255,255,0.9))`,
                opacity: hasData ? 0.95 : 0,
                boxShadow: `0 0 18px ${cfg.soft}`,
              }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  )
}
