'use client';

import React, { useState } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';

type Curator = {
  id: number;
  name: string;
  platform?: string;
  followerCount?: number;
  playlistCount?: number;
};

type SearchResponse = {
  obj: {
    curators?: Curator[];
  };
};

export default function CuratorsClient() {
  const [inputValue, setInputValue] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curators, setCurators] = useState<Curator[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setQ(inputValue);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const params = new URLSearchParams({ q: inputValue, type: 'curators' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setCurators(data.obj.curators ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setCurators([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="curators-q" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Curator search
          </label>
          <input
            id="curators-q"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Curator name or URL..."
            className="input-base"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-[38px] items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/30 px-4 text-sm font-medium text-violet-400 hover:bg-violet-500/25 hover:text-violet-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <SkeletonBox className="w-10 h-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <SkeletonBox className="h-4 w-28" />
                  <SkeletonBox className="h-3 w-20" />
                </div>
              </div>
              <SkeletonBox className="h-3 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && searched && curators.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-4xl text-slate-700">✦</span>
          <p className="text-sm text-slate-500">No curators found for &quot;{q}&quot;</p>
          <p className="text-xs text-slate-600">Try another query or confirm spelling.</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && curators.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{curators.length} curators found</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {curators.map((c) => {
              const initials = c.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('');
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-xl border border-slate-800 bg-slate-900 p-4',
                    'hover:border-violet-500/30 hover:bg-slate-900/80 transition-all duration-150',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-violet-400 text-xs font-bold">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-100 truncate text-sm">{c.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {c.platform && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 capitalize">
                            {c.platform}
                          </span>
                        )}
                        {c.followerCount != null && (
                          <span className="text-[10px] text-slate-500">{formatNumber(c.followerCount)} followers</span>
                        )}
                        {c.playlistCount != null && (
                          <span className="text-[10px] text-slate-500">{c.playlistCount} playlists</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
