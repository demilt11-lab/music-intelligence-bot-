'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  /** Unique key for this filter. */
  key: string;
  /** Display label for the filter group. */
  label: string;
  /** Available options. */
  options: FilterOption[];
}

export interface FilterBarProps {
  /** Array of filter definitions. */
  filters: FilterConfig[];
  /** Current active values keyed by filter key. */
  values: Record<string, string>;
  /** Called when a filter changes. */
  onChange: (key: string, value: string) => void;
  /** Called when reset button is clicked. */
  onReset: () => void;
  className?: string;
}

/**
 * Horizontal pill-style filter bar. Shows a "Reset" button when any filter is active.
 */
export function FilterBar({ filters, values, onChange, onReset, className }: FilterBarProps) {
  const hasActive = filters.some((f) => values[f.key] && values[f.key] !== '');

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {filters.map((filter) => {
        const current = values[filter.key] ?? '';
        const isActive = current !== '';

        return (
          <div key={filter.key} className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">{filter.label}:</span>
            <div className="flex items-center gap-1">
              {filter.options.map((opt) => {
                const selected = current === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(filter.key, selected ? '' : opt.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150',
                      'focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
                      selected
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600',
                    )}
                    aria-pressed={selected}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {hasActive && (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150',
            'text-slate-400 border-slate-700/50 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/5',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500',
          )}
        >
          Reset all
        </button>
      )}
    </div>
  );
}
