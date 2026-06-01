'use client';

import React from 'react';
import { cn, formatNumber, formatDelta } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Stats for a single platform. */
export interface PlatformMetric {
  /** The primary stat value (e.g., stream count). */
  value: number | null;
  /** Delta as a decimal (0.15 = +15%). Pass null if unavailable. */
  delta?: number | null;
  /** Raw delta already as a percentage number (e.g., 15.3 = +15.3%). */
  deltaRaw?: number | null;
}

/** Platform stats input object. */
export interface PlatformStatsData {
  /** Spotify streams. */
  spotify?: PlatformMetric;
  /** TikTok video uses / UGC count. */
  tiktok?: PlatformMetric;
  /** YouTube views. */
  youtube?: PlatformMetric;
  /** Radio spins. */
  radio?: PlatformMetric;
}

/** Props for the PlatformStats component. */
export interface PlatformStatsProps {
  /** Platform metric data. */
  stats: PlatformStatsData;
  /** Layout direction. @default "row" */
  layout?: 'row' | 'grid';
  /** Size variant. @default "md" */
  size?: 'sm' | 'md';
  /** Additional className for the container. */
  className?: string;
}

// ─── Platform configs ─────────────────────────────────────────────────────────

interface PlatformConfig {
  key: keyof PlatformStatsData;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
}

const SPOTIFY_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-full h-full">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const TIKTOK_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-full h-full">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.79a8.18 8.18 0 0 0 4.78 1.52V6.87a4.85 4.85 0 0 1-1.01-.18z" />
  </svg>
);

const YOUTUBE_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-full h-full">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const RADIO_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-full h-full">
    <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
    <path d="M3.6 9h16.8M3.6 15h16.8" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
  </svg>
);

const PLATFORM_CONFIGS: PlatformConfig[] = [
  { key: 'spotify', label: 'Spotify streams', shortLabel: 'Spotify', icon: SPOTIFY_ICON, color: 'text-emerald-400' },
  { key: 'tiktok',  label: 'TikTok uses',     shortLabel: 'TikTok',  icon: TIKTOK_ICON,  color: 'text-sky-400' },
  { key: 'youtube', label: 'YouTube views',   shortLabel: 'YouTube', icon: YOUTUBE_ICON, color: 'text-rose-400' },
  { key: 'radio',   label: 'Radio spins',     shortLabel: 'Radio',   icon: RADIO_ICON,   color: 'text-amber-400' },
];

// ─── Single pill ──────────────────────────────────────────────────────────────

function StatPill({
  config,
  metric,
  size,
}: {
  config: PlatformConfig;
  metric: PlatformMetric;
  size: 'sm' | 'md';
}) {
  const delta = metric.delta ?? metric.deltaRaw;
  const isDeltaRaw = metric.delta === undefined || metric.delta === null;
  const deltaStr =
    delta === undefined || delta === null
      ? null
      : isDeltaRaw
      ? (delta > 0 ? '+' : '') + delta.toFixed(1) + '%'
      : formatDelta(delta);

  const deltaPositive = delta !== null && delta !== undefined && delta > 0;
  const deltaNegative = delta !== null && delta !== undefined && delta < 0;

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const valueSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const deltaSize = size === 'sm' ? 'text-2xs' : 'text-xs';

  return (
    <Tooltip content={config.label}>
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg',
          'bg-slate-800 border border-slate-700',
          'whitespace-nowrap',
        )}
      >
        <span className={cn('shrink-0', iconSize, config.color)} aria-hidden="true">
          {config.icon}
        </span>
        <span className={cn('font-medium tabular-nums text-slate-100', valueSize)}>
          {metric.value !== null && metric.value !== undefined
            ? formatNumber(metric.value)
            : '—'}
        </span>
        {deltaStr && (
          <span
            className={cn(
              'font-medium tabular-nums',
              deltaSize,
              deltaPositive && 'text-emerald-400',
              deltaNegative && 'text-rose-400',
              !deltaPositive && !deltaNegative && 'text-slate-400',
            )}
          >
            {deltaStr}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Row of platform metric pills showing Spotify, TikTok, YouTube, and Radio stats.
 * Delta values are color-coded: emerald for positive, rose for negative.
 */
export function PlatformStats({
  stats,
  layout = 'row',
  size = 'md',
  className,
}: PlatformStatsProps) {
  const entries = PLATFORM_CONFIGS.filter((cfg) => stats[cfg.key] !== undefined);

  if (entries.length === 0) {
    return (
      <span className="text-xs text-slate-600 italic">No platform data</span>
    );
  }

  return (
    <div
      className={cn(
        layout === 'row' ? 'flex flex-wrap items-center gap-1.5' : 'grid grid-cols-2 gap-1.5',
        className,
      )}
      aria-label="Platform statistics"
    >
      {entries.map((cfg) => {
        const metric = stats[cfg.key]!;
        return (
          <StatPill key={cfg.key} config={cfg} metric={metric} size={size} />
        );
      })}
    </div>
  );
}

PlatformStats.displayName = 'PlatformStats';

export default PlatformStats;
