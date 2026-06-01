/**
 * Shared utility functions for the music intelligence platform UI.
 */

// ─── Class name merging ──────────────────────────────────────────────────────

/**
 * Merges class names, resolving Tailwind conflicts by keeping last wins.
 * Manual implementation: deduplicates by CSS property prefix.
 */
export function cn(...inputs: Array<string | undefined | null | false>): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    const parts = input.trim().split(/\s+/);
    for (const cls of parts) {
      if (cls) classes.push(cls);
    }
  }

  // Deduplicate by keeping last occurrence of each "base" class prefix
  // Handles patterns like: text-sm text-lg → text-lg
  const seen = new Map<string, number>();
  for (let i = 0; i < classes.length; i++) {
    const base = getClassBase(classes[i]);
    seen.set(base, i);
  }

  const result: string[] = [];
  for (let i = 0; i < classes.length; i++) {
    const base = getClassBase(classes[i]);
    if (seen.get(base) === i) {
      result.push(classes[i]);
    }
  }

  return result.join(' ');
}

/** Extract the "base" of a Tailwind class for conflict detection. */
function getClassBase(cls: string): string {
  // Handle responsive/state prefixes: hover:text-sm → group:hover, text
  // For simple dedup, keep the full class as its own base unless it's
  // a numeric suffix variant (text-sm / text-lg both → text)
  const withoutVariants = cls.replace(/^([\w-]+:)+/, '');
  // Match patterns like: text-sm, bg-slate-900, p-4, rounded-lg
  const match = withoutVariants.match(/^([a-z-]+)-/);
  if (match) {
    // Preserve variant prefix for proper dedup scoping
    const prefix = cls.replace(withoutVariants, '');
    return prefix + match[1];
  }
  return cls;
}

// ─── Number formatting ───────────────────────────────────────────────────────

/**
 * Formats a large number into a human-readable abbreviated form.
 * @example formatNumber(1234567) → "1.2M"
 * @example formatNumber(45000) → "45K"
 * @example formatNumber(999) → "999"
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 10_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${abs.toLocaleString()}`;
}

/**
 * Formats a decimal delta as a signed percentage string.
 * @example formatDelta(0.15) → "+15.0%"
 * @example formatDelta(-0.032) → "-3.2%"
 * @example formatDelta(0) → "0.0%"
 */
export function formatDelta(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

/**
 * Formats a delta that's already a raw percentage (not 0-1 decimal).
 * @example formatRawDelta(15.3) → "+15.3%"
 */
export function formatRawDelta(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Formats an ISO date string to a short label.
 * @example formatDate("2024-06-01T00:00:00Z") → "Jun 1"
 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO date string to a medium label.
 * @example formatDateMed("2024-06-01") → "Jun 1, 2024"
 */
export function formatDateMed(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// ─── Math utilities ──────────────────────────────────────────────────────────

/**
 * Clamps a value between min and max (inclusive).
 * @example clamp(150, 0, 100) → 100
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalize a value from [min, max] to [0, 1].
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

// ─── String utilities ────────────────────────────────────────────────────────

/**
 * Pluralizes a word based on count.
 * @example pluralize(1, "track") → "1 track"
 * @example pluralize(3, "track") → "3 tracks"
 * @example pluralize(3, "match", "matches") → "3 matches"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count.toLocaleString()} ${word}`;
}

/**
 * Truncates a string to maxLen characters with ellipsis.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Converts a string to title case.
 */
export function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns initials from a name (up to 2 characters).
 * @example getInitials("Taylor Swift") → "TS"
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ─── Color helpers ───────────────────────────────────────────────────────────

/**
 * Returns Tailwind color class for a delta value.
 * Positive → emerald, Negative → rose, Zero → slate
 */
export function deltaColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return 'text-slate-500';
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-slate-400';
}

/**
 * Returns Tailwind bg color class for a score 0–1.
 * < 0.4 → emerald (low risk), 0.4–0.7 → amber (moderate), > 0.7 → rose (high)
 */
export function scoreColorClass(score: number): { text: string; bg: string; border: string } {
  if (score > 0.7) return { text: 'text-rose-400', bg: 'bg-rose-500', border: 'border-rose-500' };
  if (score > 0.4) return { text: 'text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500' };
  return { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500' };
}
