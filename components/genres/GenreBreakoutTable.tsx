'use client';

import React from 'react';
import { DataTable } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';

type GenreSignal = {
  genre: string;
  ugcVideos7d: number;
  ugcVideos7dGrowth: number;
  intlStreams7d: number;
  intlStreams7dGrowth: number;
  usStreams7d: number;
  usStreams7dGrowth: number;
  usSpins7d: number;
  usSpins7dGrowth: number;
  leadFormat: string | null;
  breakoutScore: number;
  commentary: string;
};

type ApiResponse = {
  obj: GenreSignal[];
  meta: { date?: string; usCode2: string };
};

const REGION_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  BR: 'Brazil',
  MX: 'Mexico',
  JP: 'Japan',
  KR: 'South Korea',
  GLOBAL: 'Global',
};

function regionLabel(code: string): string {
  return REGION_NAMES[code] ?? code;
}

export function GenreBreakoutTable() {
  const [data, setData] = React.useState<GenreSignal[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [usCode2, setUsCode2] = React.useState('US');
  const [markets, setMarkets] = React.useState<string[]>(['US']);
  const [limit, setLimit] = React.useState('5');
  const [error, setError] = React.useState<string | null>(null);

  // Populate the region dropdown from markets that actually have data.
  React.useEffect(() => {
    let active = true;
    fetch('/api/talent-scout/genres/markets')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (active && Array.isArray(body?.obj) && body.obj.length) {
          setMarkets(body.obj as string[]);
        }
      })
      .catch(() => {
        /* keep default ['US'] */
      });
    return () => {
      active = false;
    };
  }, []);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        usCode2,
        limit,
      });
      const res = await fetch(`/api/talent-scout/genres?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed with ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json.obj);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load genre breakouts.');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [usCode2, limit]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const columns = [
    {
      key: 'rank',
      header: '#',
      width: '3rem',
      render: (_row: GenreSignal, idx: number) => idx + 1,
    },
    {
      key: 'genre',
      header: 'Genre',
      render: (row: GenreSignal) => (
        <div className="text-sm font-medium text-slate-50">{row.genre}</div>
      ),
    },
    {
      key: 'ugc',
      header: 'UGC (7d)',
      render: (row: GenreSignal) => (
        <div className="text-xs text-slate-200">
          <div>{row.ugcVideos7d.toLocaleString()} videos</div>
          <div
            className={
              row.ugcVideos7dGrowth > 0 ? 'text-emerald-400' : 'text-slate-400'
            }
          >
            {row.ugcVideos7dGrowth.toFixed(1)}%
          </div>
        </div>
      ),
    },
    {
      key: 'intl',
      header: 'Intl streams (7d)',
      render: (row: GenreSignal) => (
        <div className="text-xs text-slate-200">
          <div>{row.intlStreams7d.toLocaleString()}</div>
          <div
            className={
              row.intlStreams7dGrowth > 0 ? 'text-emerald-400' : 'text-slate-400'
            }
          >
            {row.intlStreams7dGrowth.toFixed(1)}%
          </div>
        </div>
      ),
    },
    {
      key: 'us',
      header: 'US streams (7d)',
      render: (row: GenreSignal) => (
        <div className="text-xs text-slate-200">
          <div>{row.usStreams7d.toLocaleString()}</div>
          <div
            className={
              row.usStreams7dGrowth > 0 ? 'text-emerald-400' : 'text-slate-400'
            }
          >
            {row.usStreams7dGrowth.toFixed(1)}%
          </div>
        </div>
      ),
    },
    {
      key: 'radio',
      header: 'US radio (7d)',
      render: (row: GenreSignal) => (
        <div className="text-xs text-slate-200">
          <div>{row.usSpins7d.toLocaleString()} spins</div>
          <div
            className={
              row.usSpins7dGrowth > 0 ? 'text-emerald-400' : 'text-slate-400'
            }
          >
            {row.usSpins7dGrowth.toFixed(1)}% {row.leadFormat && `• ${row.leadFormat}`}
          </div>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      render: (row: GenreSignal) => (
        <span className="text-sm font-semibold text-emerald-400">
          {row.breakoutScore.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Why it matters',
      render: (row: GenreSignal) => (
        <p className="max-w-md text-xs text-slate-200">{row.commentary}</p>
      ),
    },
  ];

  return (
    <section aria-label="Genre breakout list" className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Select
          id="us-market"
          label="Home market"
          value={usCode2}
          onChange={setUsCode2}
          options={markets.map((m) => ({ value: m, label: regionLabel(m) }))}
          className="w-full max-w-xs"
        />
        <Select
          id="limit"
          label="Top genres"
          value={limit}
          onChange={setLimit}
          options={[
            { value: '5', label: 'Top 5' },
            { value: '10', label: 'Top 10' },
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
        emptyMessage="No strong breakout signals yet for the selected market."
        caption="Ranked list of genres with UGC, streaming, and radio breakout signals."
      />
    </section>
  );
}
