'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type SignalType =
  | 'chart_momentum'
  | 'ugc_velocity'
  | 'playlist_adds'
  | 'radio_spins'
  | 'search_trend';

export interface Signal {
  type: SignalType;
  value: number; // 0-100
  label: string;
  description: string;
}

export interface SignalsPanelProps {
  trackId?: number | string;
  artistId?: number | string;
  signals: Signal[];
  className?: string;
}

const SIGNAL_CONFIG: Record<SignalType, { color: string; bgCls: string; textCls: string; icon: string }> = {
  chart_momentum: { color: '#7c3aed', bgCls: 'bg-violet-500',    textCls: 'text-violet-400',  icon: '◉' },
  ugc_velocity:   { color: '#f59e0b', bgCls: 'bg-amber-500',     textCls: 'text-amber-400',   icon: '♬' },
  playlist_adds:  { color: '#10b981', bgCls: 'bg-emerald-500',   textCls: 'text-emerald-400', icon: '▤' },
  radio_spins:    { color: '#0ea5e9', bgCls: 'bg-sky-500',       textCls: 'text-sky-400',     icon: '◎' },
  search_trend:   { color: '#f43f5e', bgCls: 'bg-rose-500',      textCls: 'text-rose-400',    icon: '⌕' },
};

/**
 * Renders AI signal indicators as horizontal fill bars with descriptions.
 */
export function SignalsPanel({ signals, className }: SignalsPanelProps) {
  if (!signals.length) return null;

  return (
    <div className={cn('rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col gap-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-violet-400 text-sm" aria-hidden>◈</span>
        <h3 className="text-sm font-semibold text-slate-200">Why this track?</h3>
      </div>

      {/* Signal bars */}
      <div className="space-y-3">
        {signals.map((signal) => {
          const cfg = SIGNAL_CONFIG[signal.type];
          const clampedValue = Math.min(100, Math.max(0, signal.value));

          return (
            <div key={signal.type} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-xs', cfg.textCls)} aria-hidden>{cfg.icon}</span>
                  <span className="text-xs font-medium text-slate-300">{signal.label}</span>
                </div>
                <span className={cn('text-xs font-semibold tabular-nums', cfg.textCls)}>
                  {clampedValue.toFixed(0)}
                </span>
              </div>

              {/* Bar */}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-700 ease-out', cfg.bgCls)}
                  style={{ width: `${clampedValue}%`, opacity: 0.85 }}
                  aria-label={`${signal.label}: ${clampedValue}%`}
                  role="meter"
                  aria-valuenow={clampedValue}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>

              {/* Description */}
              <p className="text-[11px] text-slate-500 leading-relaxed">{signal.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
