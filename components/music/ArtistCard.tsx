'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn, truncate, formatDelta } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { SparkLine } from './SparkLine';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Trajectory status values from the ML pipeline. */
export type ArtistStatus = 'ABOUT_TO_BREAK' | 'GROWING' | 'STABLE' | 'DECLINING';

/** Artist data shape for the ArtistCard. */
export interface ArtistCardData {
  /** Unique artist ID. */
  id: string;
  /** Artist display name. */
  name: string;
  /** Artist image/photo URL. */
  imageUrl?: string | null;
  /** ML trajectory status. */
  status?: ArtistStatus | string | null;
  /** Break probability (0–1). */
  breakProbability?: number | null;
  /** 7-day streaming delta (decimal, e.g., 0.23 = +23%). */
  streams7dDelta?: number | null;
  /** Primary genre. */
  genre?: string | null;
  /** Country code (ISO 2). */
  country?: string | null;
  /** Trajectory sparkline data points. */
  sparklineData?: number[] | null;
}

/** Props for the ArtistCard component. */
export interface ArtistCardProps {
  /** Artist data. If undefined, shows loading skeleton. */
  artist?: ArtistCardData | null;
  /** Shows the loading skeleton state. */
  loading?: boolean;
  /** Called when the card is clicked. */
  onClick?: (artist: ArtistCardData) => void;
  /** Link href for artist detail page. */
  href?: string;
  /** Additional className. */
  className?: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  badgeVariant: 'success' | 'info' | 'default' | 'danger';
  dot: boolean;
  sparkColor: string;
  textColor: string;
}

const STATUS_CONFIG: Record<ArtistStatus, StatusConfig> = {
  ABOUT_TO_BREAK: {
    label: 'About to Break',
    badgeVariant: 'success',
    dot: true,
    sparkColor: '#10b981',
    textColor: 'text-emerald-400',
  },
  GROWING: {
    label: 'Growing',
    badgeVariant: 'info',
    dot: false,
    sparkColor: '#0ea5e9',
    textColor: 'text-sky-400',
  },
  STABLE: {
    label: 'Stable',
    badgeVariant: 'default',
    dot: false,
    sparkColor: '#64748b',
    textColor: 'text-slate-400',
  },
  DECLINING: {
    label: 'Declining',
    badgeVariant: 'danger',
    dot: false,
    sparkColor: '#f43f5e',
    textColor: 'text-rose-400',
  },
};

function getStatusConfig(status: string | null | undefined): StatusConfig {
  if (!status) return STATUS_CONFIG.STABLE;
  const upper = status.toUpperCase().replace(/\s+/g, '_') as ArtistStatus;
  return STATUS_CONFIG[upper] ?? STATUS_CONFIG.STABLE;
}

// ─── Artist image ─────────────────────────────────────────────────────────────

function ArtistAvatar({
  src,
  name,
  size,
}: {
  src?: string | null;
  name: string;
  size: number;
}) {
  const [errored, setErrored] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  if (!src || errored) {
    return (
      <div
        className="rounded-full bg-slate-800 flex items-center justify-center shrink-0 border-2 border-slate-700"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className="text-slate-400 font-semibold" style={{ fontSize: size * 0.35 }}>
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0 border-2 border-slate-700"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={`${name} photo`}
        fill
        sizes={`${size}px`}
        className="object-cover"
        onError={() => setErrored(true)}
        unoptimized
      />
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ArtistCardSkeleton() {
  return (
    <Card variant="default" className="p-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="avatar" width={48} height={48} className="rounded-full" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton variant="text" width="55%" />
          <div className="flex gap-2">
            <Skeleton variant="text" width={72} height={20} className="rounded-full" />
            <Skeleton variant="text" width={48} height={20} className="rounded-full" />
          </div>
        </div>
        <Skeleton width={72} height={28} className="rounded-md" />
      </div>
    </Card>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Artist breakout card showing trajectory status, stats, and sparkline.
 * Status variants: ABOUT_TO_BREAK (emerald pulse), GROWING (sky),
 * STABLE (slate), DECLINING (rose).
 */
export function ArtistCard({
  artist,
  loading = false,
  onClick,
  href,
  className,
}: ArtistCardProps) {
  if (loading || !artist) {
    return <ArtistCardSkeleton />;
  }

  const statusCfg = getStatusConfig(artist.status);
  const hasSpark = artist.sparklineData && artist.sparklineData.length > 1;
  const hasDelta =
    artist.streams7dDelta !== null && artist.streams7dDelta !== undefined;
  const deltaStr = hasDelta ? formatDelta(artist.streams7dDelta!) : null;
  const deltaPositive = (artist.streams7dDelta ?? 0) > 0;
  const deltaNegative = (artist.streams7dDelta ?? 0) < 0;

  return (
    <Card
      variant="default"
      hoverable={!!(onClick || href)}
      asLink={href}
      className={cn('p-3 group', className)}
      onClick={onClick ? () => onClick(artist) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(artist);
              }
            }
          : undefined
      }
      aria-label={onClick ? `View artist ${artist.name}` : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <ArtistAvatar src={artist.imageUrl} name={artist.name} size={48} />

        {/* Main info */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate leading-snug">
              {truncate(artist.name, 32)}
            </span>
            {/* Break probability */}
            {artist.breakProbability !== null &&
              artist.breakProbability !== undefined && (
                <div className="shrink-0 flex flex-col items-end">
                  <span
                    className={cn(
                      'text-sm font-bold tabular-nums leading-none',
                      statusCfg.textColor,
                    )}
                  >
                    {Math.round(artist.breakProbability * 100)}%
                  </span>
                  <span className="text-2xs text-slate-600 uppercase tracking-wide">
                    break
                  </span>
                </div>
              )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {artist.status && (
              <Badge variant={statusCfg.badgeVariant} size="sm" dot={statusCfg.dot}>
                {statusCfg.label}
              </Badge>
            )}
            {artist.genre && (
              <span className="text-xs text-slate-500 truncate max-w-[80px]">
                {artist.genre}
              </span>
            )}
            {artist.country && (
              <span className="text-xs text-slate-600 font-medium uppercase">
                {artist.country}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-1">
            {hasDelta && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">7d</span>
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    deltaPositive && 'text-emerald-400',
                    deltaNegative && 'text-rose-400',
                    !deltaPositive && !deltaNegative && 'text-slate-400',
                  )}
                >
                  {deltaStr}
                </span>
              </div>
            )}

            {hasSpark && (
              <div className="ml-auto">
                <SparkLine
                  data={artist.sparklineData!}
                  width={72}
                  height={24}
                  color={statusCfg.sparkColor}
                  showDot
                  filled
                  aria-label={`${artist.name} trajectory`}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

ArtistCard.displayName = 'ArtistCard';

export default ArtistCard;
