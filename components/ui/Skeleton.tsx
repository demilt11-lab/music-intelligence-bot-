'use client';

import React, { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape variant for the Skeleton. */
export type SkeletonVariant = 'text' | 'card' | 'avatar' | 'stat' | 'table-row' | 'chart';

/** Props for the base Skeleton component. */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Shape/context variant. @default "text" */
  variant?: SkeletonVariant;
  /** Width override (CSS value). */
  width?: string | number;
  /** Height override (CSS value). */
  height?: string | number;
  /** Whether to show the shimmer animation. @default true */
  animated?: boolean;
}

// ─── Base shimmer element ─────────────────────────────────────────────────────

/**
 * Base shimmer rectangle used to compose skeleton layouts.
 */
export function SkeletonBox({
  className,
  width,
  height,
  animated = true,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-slate-800',
        animated && 'shimmer',
        className,
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}

// ─── Variant skeletons ────────────────────────────────────────────────────────

/** Single line of text skeleton. */
function TextSkeleton({ className, width = '100%', ...rest }: SkeletonProps) {
  return <SkeletonBox className={cn('h-4', className)} width={width} {...rest} />;
}

/** Card skeleton with image placeholder and text lines. */
function CardSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col gap-3',
        className,
      )}
      aria-hidden="true"
    >
      <SkeletonBox className="h-32 w-full rounded-lg" animated={animated} />
      <SkeletonBox className="h-4 w-3/4" animated={animated} />
      <SkeletonBox className="h-3 w-1/2" animated={animated} />
      <div className="flex gap-2 mt-1">
        <SkeletonBox className="h-6 w-16 rounded-full" animated={animated} />
        <SkeletonBox className="h-6 w-16 rounded-full" animated={animated} />
      </div>
    </div>
  );
}

/** Circular avatar skeleton. */
function AvatarSkeleton({ className, width = 40, height = 40, animated = true }: SkeletonProps) {
  return (
    <SkeletonBox
      className={cn('rounded-full shrink-0', className)}
      width={width}
      height={height}
      animated={animated}
    />
  );
}

/** Stat card skeleton (large number + label). */
function StatSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      <SkeletonBox className="h-3 w-20" animated={animated} />
      <SkeletonBox className="h-8 w-28" animated={animated} />
      <SkeletonBox className="h-3 w-16" animated={animated} />
    </div>
  );
}

/** Table row skeleton. */
function TableRowSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div
      className={cn('flex items-center gap-4 px-4 py-3 border-b border-slate-800', className)}
      aria-hidden="true"
    >
      <SkeletonBox className="h-9 w-9 rounded-md shrink-0" animated={animated} />
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <SkeletonBox className="h-3.5" width="55%" animated={animated} />
        <SkeletonBox className="h-3" width="35%" animated={animated} />
      </div>
      <SkeletonBox className="h-6 w-16 rounded-full shrink-0" animated={animated} />
      <SkeletonBox className="h-3.5 w-20 shrink-0" animated={animated} />
      <SkeletonBox className="h-3.5 w-14 shrink-0" animated={animated} />
    </div>
  );
}

/** Chart area skeleton. */
function ChartSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      {/* Y-axis labels + bars */}
      <div className="flex items-end gap-2 h-32">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBox
            key={i}
            className="flex-1 rounded-sm"
            height={`${30 + Math.sin(i * 1.2) * 20 + Math.random() * 40}%`}
            animated={animated}
          />
        ))}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBox key={i} className="flex-1 h-3 rounded" animated={animated} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Composable skeleton loading placeholder. Supports text, card, avatar,
 * stat, table-row, and chart variants with animated shimmer effect.
 */
export function Skeleton({ variant = 'text', ...props }: SkeletonProps) {
  switch (variant) {
    case 'card':      return <CardSkeleton {...props} />;
    case 'avatar':    return <AvatarSkeleton {...props} />;
    case 'stat':      return <StatSkeleton {...props} />;
    case 'table-row': return <TableRowSkeleton {...props} />;
    case 'chart':     return <ChartSkeleton {...props} />;
    default:          return <TextSkeleton {...props} />;
  }
}

Skeleton.displayName = 'Skeleton';

// Named exports for direct use
export { TextSkeleton as SkeletonText };
export { CardSkeleton as SkeletonCard };
export { AvatarSkeleton as SkeletonAvatar };
export { StatSkeleton as SkeletonStat };
export { TableRowSkeleton as SkeletonTableRow };
export { ChartSkeleton as SkeletonChart };

export default Skeleton;
