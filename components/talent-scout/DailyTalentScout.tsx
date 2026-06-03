'use client';

import React from 'react';
import { CompanionHeader } from './CompanionHeader';
import { ScoutTrackCard, ScoutTrack } from './ScoutTrackCard';
import { TrackCardSkeleton } from '@/components/ui/Skeleton';
import { CompanionMessage } from '@/components/ui/CompanionMessage';

type ApiResponse = {
  obj: (ScoutTrack & { totalScore: number })[];
  meta: {
    date?: string;
    code2: string;
    mode: string;
    tier4Error?: string;
  };
};

export function DailyTalentScout() {
  const [data, setData] = React.useState<ScoutTrack[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'ugc_early' | 'general'>('ugc_early');
  const [code2, setCode2] = React.useState('US');

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ code2, mode, limit: '50' });
      const res = await fetch(`/api/talent-scout/daily?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Request failed ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json.obj.map((t, i) => ({ ...t, rank: i + 1 })));
    } catch (err: any) {
      setError(err.message ?? 'Failed to load data.');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [code2, mode]);

  React.useEffect(() => { void fetchData(); }, [fetchData]);

  const hotCount = data.filter((t) => t.totalScore >= 0.5).length;

  return (
    <section aria-label="Daily A&R Talent Scout" className="flex flex-col min-h-screen">
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

      <div className="flex-1 px-5 py-5">
        {/* Error state */}
        {error && !isLoading && (
          <div role="alert" className="mb-4">
            <CompanionMessage
              message={`Something went wrong: ${error} — I'll keep trying.`}
              type="warning"
            />
          </div>
        )}

        {/* Loading state — skeleton grid */}
        {isLoading && (
          <div
            className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Loading tracks"
            aria-busy="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <TrackCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center text-2xl text-slate-600">
              ◎
            </div>
            <div className="text-center space-y-1 max-w-xs">
              <p className="text-sm font-medium text-slate-300">Nothing to show yet</p>
              <p className="text-xs text-slate-500">
                {mode === 'ugc_early'
                  ? "I'm looking for early UGC breakouts in this market. The ingest pipeline runs every few hours."
                  : "No tracks match the current filters. Try switching to Global or General mode."}
              </p>
            </div>
            <button
              onClick={fetchData}
              className="mt-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Track grid */}
        {!isLoading && data.length > 0 && (
          <div
            className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
            aria-label={`${data.length} tracks`}
          >
            {data.map((track, idx) => (
              <ScoutTrackCard
                key={track.trackId}
                track={track}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
