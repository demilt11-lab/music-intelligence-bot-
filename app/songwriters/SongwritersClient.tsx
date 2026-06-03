'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';

type Songwriter = {
  id: number;
  name: string;
  country?: string;
  trackCount?: number;
};

type SearchResponse = {
  obj: {
    songwriters?: Songwriter[];
  };
};

export default function SongwritersClient() {
  const [inputValue, setInputValue] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songwriters, setSongwriters] = useState<Songwriter[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setQ(inputValue);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const params = new URLSearchParams({ q: inputValue, type: 'songwriters' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setSongwriters(data.obj.songwriters ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setSongwriters([]);
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
          <label htmlFor="songwriters-q" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Songwriter search
          </label>
          <input
            id="songwriters-q"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Songwriter name..."
            className="input-base"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-[38px] items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 px-4 text-sm font-medium text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-slate-800 bg-slate-900/50">
              <SkeletonBox className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <SkeletonBox className="h-3.5 w-36" />
                <SkeletonBox className="h-3 w-20" />
              </div>
              <SkeletonBox className="h-3 w-16" />
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
      {!loading && !error && searched && songwriters.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-4xl text-slate-700">♩</span>
          <p className="text-sm text-slate-500">No songwriters found for &quot;{q}&quot;</p>
          <p className="text-xs text-slate-600">Try another query or confirm spelling.</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && songwriters.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{songwriters.length} songwriters found</p>
          <div className="space-y-1.5">
            {songwriters.map((s) => {
              const initials = s.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('');
              return (
                <Link
                  key={s.id}
                  href={`/songwriters/${s.id}/catalog`}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-800 bg-slate-900/50',
                    'hover:border-amber-500/30 hover:bg-slate-900/80 transition-all duration-150',
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-amber-400 text-xs font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-200 text-sm truncate">{s.name}</p>
                    {s.country && <p className="text-xs text-slate-500 truncate">{s.country}</p>}
                  </div>
                  {s.trackCount != null && (
                    <span className="text-xs text-slate-500 shrink-0">{s.trackCount} tracks</span>
                  )}
                  <svg className="text-slate-600 shrink-0" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
