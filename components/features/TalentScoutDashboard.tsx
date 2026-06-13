'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CompanionHeader } from '@/components/talent-scout/CompanionHeader';
import { ScoutTrackCard, ScoutTrack } from '@/components/talent-scout/ScoutTrackCard';
import { StatCard } from '@/components/ui/StatCard';
import { TrackCardSkeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/utils';

type ApiResponse = {
  obj: (ScoutTrack & { totalScore: number })[];
  meta: {
    date?: string;
    code2: string;
    mode: string;
    tier4Error?: string;
  };
};

type ViewMode = 'grid' | 'table';

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Full talent scout dashboard with stats row, view toggle, grid/table views.
 */
export function TalentScoutDashboard() {
  const [data, setData] = useState<ScoutTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'ugc_early' | 'general'>('ugc_early');
  const [code2, setCode2] = useState('US');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ code2, mode, limit: '50' });
      const res = await fetch(`/api/talent-scout/daily?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error ?? `Request failed ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json.obj.map((t, i) => ({ ...t, rank: i + 1 })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load data.';
      setError(msg);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [code2, mode]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const hotCount = data.filter((t) => t.totalScore >= 0.5).length;
  const risingCount = data.filter((t) => t.totalScore >= 0.25 && t.totalScore < 0.5).length;
  const avgScore = avg(data.map((t) => t.totalScore));

  return (
    <div className="flex flex-col min-h-screen">
      <CompanionHeader
        trackCount={data.length}
        hotCount={hotCount}
        mode={mode}
        code2={code2}
        onModeChange={setMode}
        onMarketChange={setCode2}
        onRefresh={fetchData}
        isLoading={isLoading}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Tracks Monitored"
            value={isLoading ? '—' : data.length.toString()}
            icon="◎"
            loading={isLoading}
          />
          <StatCard
            label="Hot Tracks"
            value={isLoading ? '—' : hotCount.toString()}
            icon="🔥"
            loading={isLoading}
          />
          <StatCard
            label="Rising"
            value={isLoading ? '—' : risingCount.toString()}
            icon="↑"
            loading={isLoading}
          />
          <StatCard
            label="Avg Score"
            value={isLoading ? '—' : `${(avgScore * 100).toFixed(0)}`}
            icon="◈"
            loading={isLoading}
          />
        </div>

        {/* View toggle */}
        {!isLoading && !error && data.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">View:</span>
            <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
              {(['grid', 'table'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                    viewMode === v
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
                  aria-pressed={viewMode === v}
                >
                  {v === 'grid' ? '⊞ Grid' : '☰ Table'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">
            {error}
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }, (_, i) => <TrackCardSkeleton key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl text-slate-700">◎</span>
            <p className="text-sm text-slate-500">No tracks found — try a different market or mode.</p>
          </div>
        )}

        {/* Grid view */}
        {!isLoading && !error && data.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((track, idx) => (
              <ScoutTrackCard key={track.trackId} track={track} index={idx} />
            ))}
          </div>
        )}

        {/* Table view */}
        {!isLoading && !error && data.length > 0 && viewMode === 'table' && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50">
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-10">#</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Track</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Artist</th>
                    <th className="text-center px-4 py-2.5 text-slate-500 font-medium w-16">Score</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-medium w-24">TikTok</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-medium w-24">Spotify</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((track, idx) => {
                    const scoreColor = track.totalScore >= 0.5 ? 'text-amber-400' : track.totalScore >= 0.25 ? 'text-emerald-400' : 'text-slate-400';
                    return (
                      <tr
                        key={track.trackId}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-slate-200 font-medium truncate max-w-[160px]">{track.name}</td>
                        <td className="px-4 py-2.5 text-slate-400 truncate max-w-[120px]">{track.artists.join(', ') || 'Unknown Artist'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`font-semibold tabular-nums ${scoreColor}`}>
                            {(track.totalScore * 100).toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{formatNumber(Number(track.tiktokViews) || null)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{formatNumber(Number(track.spotifyStreamsLatest) || null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
