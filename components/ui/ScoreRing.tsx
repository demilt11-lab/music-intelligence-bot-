import React from 'react'

interface ScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
  className?: string
  label?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function getRingTheme(score: number) {
  if (score >= 0.7) {
    return {
      stroke: '#34d399',
      text: '#a7f3d0',
      glow: '0 0 24px rgba(52, 211, 153, 0.18)',
      track: 'rgba(255,255,255,0.08)',
      surface: 'radial-gradient(circle at 30% 30%, rgba(52,211,153,0.16), rgba(16,185,129,0.06) 45%, rgba(255,255,255,0.02) 100%)',
    }
  }

  if (score >= 0.4) {
    return {
      stroke: '#fbbf24',
      text: '#fde68a',
      glow: '0 0 24px rgba(251, 191, 36, 0.16)',
      track: 'rgba(255,255,255,0.08)',
      surface: 'radial-gradient(circle at 30% 30%, rgba(251,191,36,0.14), rgba(245,158,11,0.06) 45%, rgba(255,255,255,0.02) 100%)',
    }
  }

  return {
    stroke: '#a1a1aa',
    text: '#e4e4e7',
    glow: '0 0 24px rgba(255, 255, 255, 0.06)',
    track: 'rgba(255,255,255,0.08)',
    surface: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.02) 100%)',
  }
}

export function ScoreRing({
  score,
  size = 48,
  strokeWidth = 4,
  className = '',
  label,
}: ScoreRingProps) {
  const safeScore = clamp(score)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - safeScore)
  const percentage = Math.round(safeScore * 100)
  const theme = getRingTheme(safeScore)

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full border border-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        background: theme.surface,
        boxShadow: theme.glow,
      }}
      role="meter"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Score: ${percentage}`}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.track}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>

      <div className="relative flex flex-col items-center justify-center">
        <span
          className="text-[11px] font-semibold tracking-[-0.02em]"
          style={{ color: theme.text }}
        >
          {percentage}
        </span>
      </div>
    </div>
  )
}
