'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Canonical trend label values from the ML pipeline. */
export type TrendLabel = 'VIRAL' | 'TRENDING' | 'POPULAR' | 'NONE';

/** Size variants for TrendBadge. */
export type TrendBadgeSize = 'sm' | 'md';

/** Props for the TrendBadge component. */
export interface TrendBadgeProps {
  /** The ML-assigned trend label. */
  label: TrendLabel | string;
  /** Whether to show the contextual icon. @default true */
  showIcon?: boolean;
  /** Whether to show a pulsing dot on VIRAL. @default true */
  showPulse?: boolean;
  /** Size variant. @default "md" */
  size?: TrendBadgeSize;
  /** Additional className. */
  className?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface TrendConfig {
  label: string;
  variant: BadgeVariant;
  icon: React.ReactNode;
  pulse: boolean;
}

const TREND_CONFIG: Record<TrendLabel, TrendConfig> = {
  VIRAL: {
    label: 'Viral',
    variant: 'viral',
    pulse: true,
    icon: (
      // Flame icon
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="w-full h-full"
      >
        <path
          fillRule="evenodd"
          d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.177A7.547 7.547 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  TRENDING: {
    label: 'Trending',
    variant: 'trending',
    pulse: false,
    icon: (
      // Arrow trending up
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="w-full h-full"
      >
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  POPULAR: {
    label: 'Popular',
    variant: 'popular',
    pulse: false,
    icon: (
      // Star icon
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="w-full h-full"
      >
        <path
          fillRule="evenodd"
          d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  NONE: {
    label: 'None',
    variant: 'none',
    pulse: false,
    icon: (
      // Minus / dash
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
        className="w-full h-full"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
};

function normalizeTrendLabel(label: string): TrendLabel {
  const upper = label.toUpperCase().trim();
  if (upper in TREND_CONFIG) return upper as TrendLabel;
  return 'NONE';
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Music intelligence trend label badge.
 * Maps VIRAL / TRENDING / POPULAR / NONE to styled badges with icons.
 */
export function TrendBadge({
  label,
  showIcon = true,
  showPulse = true,
  size = 'md',
  className,
}: TrendBadgeProps) {
  const key = normalizeTrendLabel(label);
  const config = TREND_CONFIG[key];
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot={showPulse && config.pulse}
      className={cn('gap-1', className)}
    >
      {showIcon && !config.pulse && (
        <span className={cn('shrink-0', iconSize)} aria-hidden="true">
          {config.icon}
        </span>
      )}
      {config.label}
    </Badge>
  );
}

TrendBadge.displayName = 'TrendBadge';

export default TrendBadge;
