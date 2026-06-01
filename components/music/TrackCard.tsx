'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn, truncate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { TrendBadge } from './TrendBadge';
import { ViralScoreGauge } from './ViralScoreGauge';
import { PlatformStats, type PlatformStatsData } from './PlatformStats';
import { SparkLine } from './SparkLine';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Track data shape for the TrackCard. */
export interface TrackCardData {
  /** Unique track ID. */
  id: string;
  /** Track title. */
  title: string;
  /** Artist name(s). */
  artist: string;
  /** Cover art URL. */
  coverUrl?: string | null;
  /** ISRC code. */
  isrc?: string | null;
  /** ML trend label. */
  trendLabel?: string | null;
  /** Viral probability (0–1). */
  viralProbability?: number | null;
  /** Popularity probability (0–1). */
  popularityProbability?: number | null;
  /** Sparkline data points. */
  sparklineData?: number[] | null;
  /** Platform stats. */
  platforms?: PlatformStatsData | null;
}

/** Props for the TrackCard component. */
export interface TrackCardProps {
  /** Track data. If undefined, shows loading skeleton. */
  track?: TrackCardData | null;
  /** Whether to show the loading skeleton state. */
  loading?: boolean;
  /** Whether to show in compact mode (no expanded stats). */
  compact?: boolean;
  /** Called when the card is clicked. */
  onClick?: (track: TrackCardData) => void;
  /** Link href for the track detail page. */
  href?: string;
  /** Additional className for the card. */
  className?: string;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TrackCardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <Card variant="default" className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Skeleton variant="avatar" width={44} height={44} className="rounded-md" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
        <Skeleton variant="text" width={60} height={20} className="rounded-full" />
      </div>
      {!compact && (
        <div className="px-3 pb-3 flex gap-3 items-center border-t border-slate-800 pt-3">
          <Skeleton width={60} height={60} className="rounded-full" />
          <div className="flex-1 flex gap-2">
            <Skeleton variant="text" width={64} height={24} className="rounded-lg" />
            <Skeleton variant="text" width={64} height={24} className="rounded-lg" />
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function TrackCardError() {
  return (
    <Card variant="default" className="p-4 flex items-center gap-3 text-slate-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-slate-600 shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span className="text-sm">Failed to load track</span>
    </Card>
  );
}

// ─── Cover art ────────────────────────────────────────────────────────────────

function CoverArt({ src, alt, size }: { src?: string | null; alt: string; size: number }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className="rounded-md bg-slate-800 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size * 0.45}
          height={size * 0.45}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-slate-600"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-md overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={`${size}px`}
        className="object-cover"
        onError={() => setErrored(true)}
        unoptimized
      />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Full-featured track card for the music intelligence platform.
 * Shows cover art, title/artist, trend badge, viral score gauge,
 * platform stat pills, and sparkline. Supports compact and expanded modes.
 */
export function TrackCard({
  track,
  loading = false,
  compact = false,
  onClick,
  href,
  className,
}: TrackCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading || !track) {
    return <TrackCardSkeleton compact={compact} />;
  }

  const hasPlatforms =
    track.platforms &&
    Object.keys(track.platforms).length > 0;
  const hasViral =
    track.viralProbability !== null && track.viralProbability !== undefined;
  const hasSpark =
    track.sparklineData && track.sparklineData.length > 1;
  const showExpanded = !compact && (expanded || (hasPlatforms ?? false));

  return (
    <Card
      variant="default"
      hoverable={!!onClick || !!href}
      asLink={href}
      className={cn('p-0 overflow-hidden group', className)}
      onClick={onClick ? () => onClick(track) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(track);
              }
            }
          : undefined
      }
      aria-label={onClick ? `View ${track.title} by ${track.artist}` : undefined}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        <CoverArt src={track.coverUrl} alt={`${track.title} cover`} size={44} />

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-100 truncate leading-snug">
            {truncate(track.title, 40)}
          </span>
          <span className="text-xs text-slate-400 truncate">
            {truncate(track.artist, 36)}
          </span>
          {track.isrc && (
            <span className="text-2xs text-slate-600 font-mono mt-0.5 hidden group-hover:block">
              {track.isrc}
            </span>
          )}
        </div>

        {/* Right: badge + gauge */}
        <div className="flex items-center gap-2 shrink-0">
          {track.trendLabel && (
            <TrendBadge label={track.trendLabel} size="sm" showPulse />
          )}
          {hasViral && (
            <ViralScoreGauge
              score={track.viralProbability!}
              size={40}
              showLabel
              animated
            />
          )}
        </div>
      </div>

      {/* Expand toggle (only when not compact and has extra data) */}
      {!compact && (hasPlatforms || hasSpark) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse track details' : 'Expand track details'}
          className={cn(
            'w-full flex items-center justify-center py-1 border-t border-slate-800',
            'text-slate-600 hover:text-slate-400 hover:bg-slate-800/50',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn('transition-transform duration-200', expanded && 'rotate-180')}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Expanded section */}
      {showExpanded && (
        <div
          className={cn(
            'px-3 pb-3 pt-2 border-t border-slate-800',
            'flex items-center gap-3 flex-wrap',
            'animate-fade-in',
          )}
        >
          {hasSpark && (
            <SparkLine
              data={track.sparklineData!}
              width={80}
              height={28}
              color="#10b981"
              showDot
              filled
              aria-label="Trend sparkline"
            />
          )}
          {hasPlatforms && (
            <PlatformStats stats={track.platforms!} size="sm" />
          )}
          {track.popularityProbability !== null &&
            track.popularityProbability !== undefined && (
              <div className="flex flex-col items-center gap-0.5 ml-auto shrink-0">
                <span className="text-2xs text-slate-500 uppercase tracking-wide font-medium">
                  Popular
                </span>
                <span className="text-xs font-bold tabular-nums text-violet-400">
                  {Math.round(track.popularityProbability * 100)}%
                </span>
              </div>
            )}
        </div>
      )}
    </Card>
  );
}

TrackCard.displayName = 'TrackCard';

export default TrackCard;
