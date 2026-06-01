'use client';

import React, { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Visual color variants for the Badge. */
export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'viral'
  | 'trending'
  | 'popular'
  | 'none';

/** Size variants for the Badge. */
export type BadgeSize = 'sm' | 'md';

/** Props for the Badge component. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color/semantic variant. @default "default" */
  variant?: BadgeVariant;
  /** Size variant. @default "md" */
  size?: BadgeSize;
  /** Renders an animated pulsing dot before the label. */
  dot?: boolean;
  /** Whether the badge can be dismissed (renders an X button). */
  removable?: boolean;
  /** Callback when the remove button is clicked. */
  onRemove?: () => void;
  /** Makes the entire badge clickable. */
  onClick?: () => void;
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const variantClasses: Record<BadgeVariant, string> = {
  default:  'bg-slate-800 text-slate-300 border border-slate-700',
  success:  'bg-emerald-950 text-emerald-400 border border-emerald-800',
  warning:  'bg-amber-950 text-amber-400 border border-amber-800',
  danger:   'bg-rose-950 text-rose-400 border border-rose-800',
  info:     'bg-sky-950 text-sky-400 border border-sky-800',
  viral:    'bg-rose-950 text-rose-300 border border-rose-700',
  trending: 'bg-emerald-950 text-emerald-300 border border-emerald-700',
  popular:  'bg-violet-950 text-violet-300 border border-violet-700',
  none:     'bg-slate-900 text-slate-500 border border-slate-800',
};

const dotColorClasses: Record<BadgeVariant, string> = {
  default:  'bg-slate-400',
  success:  'bg-emerald-400',
  warning:  'bg-amber-400',
  danger:   'bg-rose-400',
  info:     'bg-sky-400',
  viral:    'bg-rose-400',
  trending: 'bg-emerald-400',
  popular:  'bg-violet-400',
  none:     'bg-slate-600',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1 rounded',
  md: 'text-xs px-2 py-0.5 gap-1.5 rounded-md',
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Compact label badge for status, trend, and categorical metadata.
 * Color-coded for music trend labels: viral, trending, popular, none.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      dot = false,
      removable = false,
      onRemove,
      onClick,
      children,
      className,
      ...rest
    },
    ref,
  ) => {
    const Tag = onClick ? 'button' : 'span';

    return (
      <Tag
        ref={ref as React.Ref<HTMLSpanElement & HTMLButtonElement>}
        onClick={onClick}
        className={cn(
          'inline-flex items-center font-medium leading-none whitespace-nowrap',
          variantClasses[variant],
          sizeClasses[size],
          onClick && 'cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
          className,
        )}
        {...(onClick ? { type: 'button' as const } : {})}
        {...rest}
      >
        {dot && (
          <span
            className={cn(
              'shrink-0 rounded-full',
              size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5',
              dotColorClasses[variant],
              // Pulse animation for viral/danger/success
              (variant === 'viral' || variant === 'danger') && 'animate-pulse-dot',
            )}
            aria-hidden="true"
          />
        )}

        {children}

        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className={cn(
              'shrink-0 rounded-sm ml-0.5',
              'opacity-60 hover:opacity-100 transition-opacity',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-current',
            )}
            aria-label="Remove"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 12 12"
              fill="currentColor"
              className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
              aria-hidden="true"
            >
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L6 5.94l.72-.72a.75.75 0 1 1 1.06 1.06L7.06 7l.72.72a.75.75 0 1 1-1.06 1.06L6 8.06l-.72.72a.75.75 0 0 1-1.06-1.06L4.94 7l-.72-.72a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        )}
      </Tag>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;
