'use client'

import React from 'react'
import type { RightsGap } from '@/lib/rights/types'

interface RightsStatusBadgeProps {
  gaps: RightsGap[]
  rightsComplexityScore: number
  className?: string
}

export function RightsStatusBadge({ gaps, rightsComplexityScore, className = '' }: RightsStatusBadgeProps) {
  const criticalCount = gaps.filter((g) => g.severity === 'critical').length
  const warnCount = gaps.filter((g) => g.severity === 'warning').length

  if (criticalCount > 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300 ${className}`}
        title={`${criticalCount} critical rights gap${criticalCount !== 1 ? 's' : ''}`}
      >
        <span aria-hidden>⚠</span> {criticalCount} rights gap{criticalCount !== 1 ? 's' : ''}
      </span>
    )
  }

  if (warnCount > 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300 ${className}`}
        title={`${warnCount} rights warning${warnCount !== 1 ? 's' : ''}`}
      >
        <span aria-hidden>!</span> {warnCount} warning{warnCount !== 1 ? 's' : ''}
      </span>
    )
  }

  const complexPct = Math.round(rightsComplexityScore * 100)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300 ${className}`}
      title={`Rights complexity: ${complexPct}%`}
    >
      <span aria-hidden>✓</span> Rights clear
    </span>
  )
}

export default RightsStatusBadge
