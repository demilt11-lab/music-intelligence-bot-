// app/ui/components/data/StatBadge.tsx
import React from 'react';
import clsx from 'clsx';

type StatBadgeProps = {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export function StatBadge({ label, value, tone = 'default' }: StatBadgeProps) {
  const toneClasses: Record<typeof tone, string> = {
    default: 'bg-slate-800 text-slate-100',
    success: 'bg-emerald-900/60 text-emerald-300',
    warning: 'bg-amber-900/60 text-amber-300',
    danger: 'bg-red-900/60 text-red-300',
  };

  return (
    <div className={clsx('inline-flex flex-col rounded-md px-3 py-2', toneClasses[tone])}>
      <span className="text-xs text-slate-300">{label}</span>
      <span className="mt-0.5 text-sm font-semibold">{value}</span>
    </div>
  );
}
