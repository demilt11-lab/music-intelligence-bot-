'use client';

import React, { forwardRef, HTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Visual style variant for the Card. */
export type CardVariant = 'default' | 'elevated' | 'ghost' | 'bordered';

/** Padding size for card sections. */
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/** Props for the root Card component. */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant. @default "default" */
  variant?: CardVariant;
  /** Adds hover elevation effect. */
  hoverable?: boolean;
  /** Wraps the card in a Next.js Link. */
  asLink?: string;
  /** Whether the card is in a loading state (applies shimmer). */
  loading?: boolean;
}

/** Props for Card.Header, Card.Body, Card.Footer sub-components. */
export interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding size for this section. @default "md" */
  padding?: CardPadding;
}

/** Props for the Card.Stat sub-component. */
export interface CardStatProps extends HTMLAttributes<HTMLDivElement> {
  /** The stat label. */
  label: string;
  /** The primary stat value. */
  value: React.ReactNode;
  /** Optional delta or secondary value. */
  delta?: React.ReactNode;
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
  /** Whether to apply a positive (emerald) or negative (rose) color to the delta. */
  deltaSign?: 'positive' | 'negative' | 'neutral';
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-slate-900 border border-slate-800 shadow-card',
  elevated: 'bg-slate-900 border border-slate-800 shadow-card-elevated',
  ghost:    'bg-transparent border border-transparent',
  bordered: 'bg-slate-900 border-2 border-slate-700',
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-6',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const CardHeader = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ padding = 'md', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        paddingClasses[padding],
        'border-b border-slate-800 flex items-center justify-between gap-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
CardHeader.displayName = 'Card.Header';

const CardBody = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ padding = 'md', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(paddingClasses[padding], className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
CardBody.displayName = 'Card.Body';

const CardFooter = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ padding = 'md', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        paddingClasses[padding],
        'border-t border-slate-800 flex items-center gap-3',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
CardFooter.displayName = 'Card.Footer';

const CardStat = forwardRef<HTMLDivElement, CardStatProps>(
  ({ label, value, delta, icon, deltaSign = 'neutral', className, ...rest }, ref) => {
    const deltaClass =
      deltaSign === 'positive'
        ? 'text-emerald-400'
        : deltaSign === 'negative'
        ? 'text-rose-400'
        : 'text-slate-400';

    return (
      <div ref={ref} className={cn('flex flex-col gap-0.5 min-w-0', className)} {...rest}>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium uppercase tracking-wide">
          {icon && <span className="w-3.5 h-3.5 shrink-0" aria-hidden="true">{icon}</span>}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-50">
            {value}
          </span>
          {delta !== undefined && (
            <span className={cn('text-xs font-medium tabular-nums', deltaClass)}>
              {delta}
            </span>
          )}
        </div>
      </div>
    );
  },
);
CardStat.displayName = 'Card.Stat';

// ─── Root Card component ─────────────────────────────────────────────────────

type CardWithSubComponents = React.ForwardRefExoticComponent<
  CardProps & React.RefAttributes<HTMLDivElement>
> & {
  Header: typeof CardHeader;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
  Stat: typeof CardStat;
};

/**
 * Flexible card container with composable sub-components.
 * Supports hover elevation, link wrapping, and loading state.
 */
const CardRoot = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      hoverable = false,
      asLink,
      loading = false,
      children,
      className,
      ...rest
    },
    ref,
  ) => {
    const baseClasses = cn(
      'rounded-xl overflow-hidden',
      variantClasses[variant],
      hoverable && 'transition-all duration-200 cursor-pointer hover:shadow-card-hover hover:border-slate-700 hover:-translate-y-0.5',
      loading && 'animate-pulse',
      className,
    );

    if (asLink) {
      return (
        <Link href={asLink} className={baseClasses}>
          <div ref={ref} {...rest}>
            {children}
          </div>
        </Link>
      );
    }

    return (
      <div ref={ref} className={baseClasses} {...rest}>
        {children}
      </div>
    );
  },
);
CardRoot.displayName = 'Card';

export const Card = CardRoot as CardWithSubComponents;
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;
Card.Stat = CardStat;

export default Card;
