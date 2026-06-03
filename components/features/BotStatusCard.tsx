'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';

interface PlatformStatus {
  name: string;
  lastIngest: string | null;
  icon: string;
}

interface HealthResponse {
  status: string;
  platforms?: Record<string, { lastIngest?: string | null }>;
  nextRun?: string | null;
}

function staleness(lastIngest: string | null): 'fresh' | 'stale' | 'very-stale' {
  if (!lastIngest) return 'very-stale';
  const age = Date.now() - new Date(lastIngest).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours < 24) return 'fresh';
  if (hours < 48) return 'stale';
  return 'very-stale';
}

const STATUS_DOT: Record<'fresh' | 'stale' | 'very-stale', string> = {
  fresh: 'bg-emerald-500',
  stale: 'bg-amber-500',
  'very-stale': 'bg-rose-500',
};

const PLATFORM_LIST: PlatformStatus[] = [
  { name: 'Billboard', icon: '◉', lastIngest: null },
  { name: 'TikTok',    icon: '♬', lastIngest: null },
  { name: 'Trends',   icon: '↗', lastIngest: null },
  { name: 'Spotify',  icon: '♪', lastIngest: null },
];

/**
 * Shows per-platform ingest health with pulsing status dots and run controls.
 */
export function BotStatusCard() {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>(PLATFORM_LIST);
  const [loading, setLoading] = useState(true);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('health check failed');
        const data: HealthResponse = await res.json();
        if (data.platforms) {
          setPlatforms(PLATFORM_LIST.map((p) => ({
            ...p,
            lastIngest: data.platforms?.[p.name.toLowerCase()]?.lastIngest ?? null,
          })));
        }
        setNextRun(data.nextRun ?? null);
      } catch {
        // Keep defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function runNow(name: string) {
    setRunning(name);
    try {
      await fetch('/api/cron/etl-artist-trajectory', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setRunning(null), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pipeline Status</h3>
        {nextRun && (
          <span className="text-[10px] text-slate-500">Next: {new Date(nextRun).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBox className="w-2.5 h-2.5 rounded-full" />
                <SkeletonBox className="h-3 w-20" />
                <SkeletonBox className="h-3 flex-1" />
              </div>
            ))
          : platforms.map((p) => {
              const s = staleness(p.lastIngest);
              const dotCls = STATUS_DOT[s];
              return (
                <div key={p.name} className="flex items-center gap-2.5 text-xs">
                  {/* Animated status dot */}
                  <motion.span
                    className={cn('w-2 h-2 rounded-full shrink-0', dotCls)}
                    animate={s === 'fresh' ? { scale: [1, 1.4, 1], opacity: [1, 0.7, 1] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <span className="text-slate-500">{p.icon}</span>
                  <span className="text-slate-300 w-16 shrink-0">{p.name}</span>
                  <span className={cn('flex-1 tabular-nums', s === 'fresh' ? 'text-emerald-400' : s === 'stale' ? 'text-amber-400' : 'text-rose-400')}>
                    {p.lastIngest ? new Date(p.lastIngest).toLocaleString() : 'Never'}
                  </span>
                  <button
                    type="button"
                    onClick={() => runNow(p.name)}
                    disabled={running === p.name}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 disabled:opacity-50 transition-colors"
                  >
                    {running === p.name ? '...' : 'Run'}
                  </button>
                </div>
              );
            })}
      </div>
    </div>
  );
}
