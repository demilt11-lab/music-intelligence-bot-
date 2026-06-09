/**
 * Shared utility functions for the music intelligence platform UI.
 */

// ─── Class name merging ──────────────────────────────────────────────────────

/**
 * Merges class names, resolving simple Tailwind conflicts by keeping last wins.
 */
export function cn(...inputs: Array<string | undefined | null | false>): string {
  const classes: string[] = []

  for (const input of inputs) {
    if (!input) continue
    const parts = input.trim().split(/\s+/)
    for (const cls of parts) {
      if (cls) classes.push(cls)
    }
  }

  const seen = new Map<string, number>()

  for (let i = 0; i < classes.length; i++) {
    const base = getClassBase(classes[i])
    seen.set(base, i)
  }

  const result: string[] = []

  for (let i = 0; i < classes.length; i++) {
    const base = getClassBase(classes[i])
    if (seen.get(base) === i) {
      result.push(classes[i])
    }
  }

  return result.join(' ')
}

/**
 * Extract the base of a Tailwind class for conflict detection.
 */
function getClassBase(cls: string): string {
  const withoutVariants = cls.replace(/^([\w-]+:)+/, '')
  const match = withoutVariants.match(/^([a-z-]+)-/)

  if (match) {
    const prefix = cls.replace(withoutVariants, '')
    return prefix + match[1]
  }

  return cls
}

// ─── Number formatting ───────────────────────────────────────────────────────

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—'

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  }

  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }

  if (abs >= 10_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }

  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`
  }

  return `${sign}${abs.toLocaleString()}`
}

export function formatDelta(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined || isNaN(value)) return '—'

  const pct = value * 100
  const sign = pct > 0 ? '+' : ''

  return `${sign}${pct.toFixed(decimals)}%`
}

export function formatRawDelta(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined || isNaN(value)) return '—'

  const sign = value > 0 ? '+' : ''

  return `${sign}${value.toFixed(decimals)}%`
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'

  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatDateMed(iso: string | Date | null | undefined): string {
  if (!iso) return '—'

  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

// ─── Math utilities ──────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}

// ─── String utilities ────────────────────────────────────────────────────────

export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count.toLocaleString()} ${word}`
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

export function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ─── Color helpers ───────────────────────────────────────────────────────────

export function deltaColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return 'text-slate-500'
  if (value > 0) return 'text-emerald-400'
  if (value < 0) return 'text-rose-400'
  return 'text-slate-400'
}

export function scoreColorClass(score: number): {
  text: string
  bg: string
  border: string
} {
  if (score > 0.7) {
    return {
      text: 'text-rose-400',
      bg: 'bg-rose-500',
      border: 'border-rose-500',
    }
  }

  if (score > 0.4) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500',
      border: 'border-amber-500',
    }
  }

  return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500',
    border: 'border-emerald-500',
  }
}
