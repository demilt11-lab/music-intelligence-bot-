'use client';

import React, { useEffect, useState } from 'react';
import { SkeletonBox } from '@/components/ui/Skeleton';

type ChartEntry = {
  chartType: string;
  rank: number;
  date: string;
  market?: string;
};

type Props = {
  trackId: string;
};

export function ChartsClient({ trackId }: Props) {
  const [data, setData] = useState<ChartEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/v1/tracks/${trackId}/charts`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to load charts');
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.obj ?? []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading charts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [trackId]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Charts</h2>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBox key={i} className="h-4 w-full" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">{error}</div>
      )}

      {!loading && !error && !data?.length && (
        <p className="text-xs text-slate-500">No chart history available.</p>
      )}

      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {data.map((entry, idx) => (
            <li key={idx} className="flex items-center gap-2 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" aria-hidden />
              <span className="text-slate-400">{entry.chartType}</span>
              <span className="text-slate-200 font-medium">#{entry.rank}</span>
              <span className="text-slate-500">{entry.date}</span>
              {entry.market && <span className="text-slate-600">({entry.market})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
