'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';

export interface StatCardProps {
  /** Descriptive label shown above the value. */
  label: string;
  /** Primary value to display. */
  value: string | number;
  /** Numeric delta for trend indicator (+/- percentage). */
  delta?: number;
  /** Text label for the delta (e.g. "vs last week"). */
  deltaLabel?: string;
  /** Icon rendered to the left of the value. */
  icon?: React.ReactNode;
  /** Show shimmer skeleton placeholder. */
  loading?: boolean;
  className?: string;
}

function DeltaIndicator({ delta, label }: { delta: number; label?: string }) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const colorCls = isPositive
    ? 'text-emerald-400'
    : isNegative
    ? 'text-rose-400'
    : 'text-slate-400';

  return (
    <div className={cn('flex items-center gap-1 text-xs', colorCls)}>
      <span aria-hidden>
        {isPositive ? '↑' : isNegative ? '↓' : '→'}
      </span>
      <span className="tabular-nums font-medium">
        {isPositive ? '+' : ''}{delta.toFixed(1)}%
      </span>
      {label && <span className="text-slate-500">{label}</span>}
    </div>
  );
}

/**
 * Compact stat card with an optional trend delta and fade-in-up entrance animation.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col gap-2', className)}>
        <SkeletonBox className="h-3 w-20" />
        <SkeletonBox className="h-7 w-28" />
        <SkeletonBox className="h-3 w-16" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col gap-1.5',
        'hover:border-slate-700 transition-colors duration-150',
        className,
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5">
        {icon && (
          <span className="text-slate-500 text-sm" aria-hidden>
            {icon}
          </span>
        )}
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-none">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="text-2xl font-bold tabular-nums tracking-tight text-slate-50">
        {value}
      </div>

      {/* Delta */}
      {delta !== undefined && (
        <DeltaIndicator delta={delta} label={deltaLabel} />
      )}
    </motion.div>
  );
}
