'use client';

import React from 'react';
import { DataTable } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';

type TalentScoutTrack = {
  trackId: number;
  name: string;
  artists: string[];
  code2: string | null;
  totalScore: number;
  tiktokViews: string | number;
  tiktokVelocity: number;
  spotifyPopularity: number | null;
  spotifyStreamsLatest: string | null;
  luminateStreamsLatest: string | null;
  actions: {
    type: string;
    description: string;
    expectedImpact: string;
  }[];
};

type ApiResponse = {
  obj: TalentScoutTrack[];
  meta: { date?: string; code2: string; mode: string };
};

export function DailyTalentScout() {
  const [data, setData] = React.useState<TalentScoutTrack[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [mode, setMode] = React.useState<'ugc_early' | 'general'>('ugc_early');
  const [code2, setCode2] = React.useState('US');
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        code2,
        mode,
        limit: '50',
      });
      const res = await fetch(`/api/talent-scout/daily?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed with ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json.obj);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load daily scout list.');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [code2, mode]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns = [
    {
      key: 'rank',
      header: '#',
      width: '3rem',
      render: (_row: TalentScoutTrack, idx: number) => idx + 1,
    },
    {
      key: 'track',
      header: 'Track',
      render: (row: TalentScoutTrack) => (
        <div>
          <div className="text-sm font-medium text-slate-50">{row.name}</div>
          <div className="text-xs text-slate-400">
            {row.artists.join(', ') || 'Unknown artist'}
          </div>
        </div>
      ),
    },
    {
      key: 'market',
      header: 'Market',
      render: (row: TalentScoutTrack) => (
        <span className="text-xs text-slate-300">{row.code2 ?? 'GLOBAL'}</span>
      ),
    },
    {
      key: 'ugc',
      header: 'TikTok Views',
      render: (row: TalentScoutTrack) => {
        const views = Number(row.tiktokViews ?? 0);
        const velocity = row.tiktokVelocity ?? 0;
        return (
          <div className="text-xs">
            <span className="font-medium text-slate-50">
              {views > 0 ? views.toLocaleString() : '—'}
            </span>
            {velocity !== 0 && (
              <span className={`ml-1 ${velocity > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {velocity > 0 ? '+' : ''}{velocity.toFixed(1)}%
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'streams',
      header: 'Streams',
      render: (row: TalentScoutTrack) => {
        const spotify = row.spotifyStreamsLatest
          ? Number(row.spotifyStreamsLatest).toLocaleString()
          : row.spotifyPopularity != null
            ? `Pop: ${row.spotifyPopularity}`
            : '—';
        const luminate = row.luminateStreamsLatest
          ? Number(row.luminateStreamsLatest).toLocaleString()
          : '—';
        return (
          <div className="text-xs text-slate-300">
            <div>Spotify: {spotify}</div>
            <div>Luminate: {luminate}</div>
          </div>
        );
      },
    },
    {
      key: 'score',
      header: 'Score',
      render: (row: TalentScoutTrack) => (
        <span className="text-sm font-semibold text-emerald-400">
          {row.totalScore.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: TalentScoutTrack) => {
        if (!row.actions?.length)
          return <span className="text-xs text-slate-400">—</span>;
        const primary = row.actions[0];
        return (
          <div className="max-w-xs text-xs text-slate-200">
            <div className="font-medium">{primary.description}</div>
            <div className="mt-0.5 text-slate-400">{primary.expectedImpact}</div>
          </div>
        );
      },
    },
  ];

  return (
    <section aria-label="Daily talent scout list" className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Select
          id="mode"
          label="Mode"
          value={mode}
          onChange={(val) => setMode(val as 'ugc_early' | 'general')}
          options={[
            { value: 'ugc_early', label: 'Early UGC (pre-break)' },
            { value: 'general', label: 'General momentum' },
          ]}
          className="w-full max-w-xs"
        />
        <Select
          id="market"
          label="Market"
          value={code2}
          onChange={setCode2}
          options={[
            { value: 'US', label: 'United States' },
            { value: 'GLOBAL', label: 'Global' },
          ]}
          className="w-full max-w-xs"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-500/60 bg-red-900/20 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <DataTable
        columns={columns as any}
        data={data}
        isLoading={isLoading}
        emptyMessage={
          mode === 'ugc_early'
            ? 'No early UGC breakouts found for this market today.'
            : 'No tracks to display for the selected filters.'
        }
        caption="Ranked list of emerging tracks based on UGC and streaming trends."
      />
    </section>
  );
}
