'use client';

import React, { useState } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';

type Playlist = {
  id: number;
  name: string;
  curatorName?: string;
  platform?: string;
  trackCount?: number;
  followerCount?: number;
};

type SearchResponse = {
  obj: {
    playlists?: Playlist[];
  };
};

const PLATFORM_ICON: Record<string, string> = {
  spotify: '♪',
  tiktok: '♬',
  youtube: '▶',
  apple: '♫',
};

export default function PlaylistsClient() {
  const [q, setQ] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setQ(inputValue);
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const params = new URLSearchParams({ q: inputValue, type: 'playlists' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setPlaylists(data.obj.playlists ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setPlaylists([]);
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
          <label htmlFor="playlists-q" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Playlist search
          </label>
          <input
            id="playlists-q"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Playlist name, curator, or URL..."
            className="input-base"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-[38px] items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-4 text-sm font-medium text-cyan-400 hover:bg-cyan-500/25 hover:text-cyan-300 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
              <SkeletonBox className="h-4 w-3/4" />
              <SkeletonBox className="h-3 w-1/2" />
              <SkeletonBox className="h-3 w-20" />
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
      {!loading && !error && searched && playlists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-4xl text-slate-700">▤</span>
          <p className="text-sm text-slate-500">No playlists found for &quot;{q}&quot;</p>
          <p className="text-xs text-slate-600">Try another query or paste a direct playlist URL.</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && playlists.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{playlists.length} playlists found</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playlists.map((p) => {
              const icon = PLATFORM_ICON[p.platform?.toLowerCase() ?? ''] ?? '♪';
              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-xl border border-slate-800 bg-slate-900 p-4',
                    'hover:border-cyan-500/30 hover:bg-slate-900/80 transition-all duration-150',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                      <span className="text-cyan-400 text-sm" aria-hidden>{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-100 truncate text-sm">{p.name}</h3>
                      {p.curatorName && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{p.curatorName}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {p.platform && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 capitalize">
                            {p.platform}
                          </span>
                        )}
                        {p.trackCount != null && (
                          <span className="text-[10px] text-slate-500">{p.trackCount} tracks</span>
                        )}
                        {p.followerCount != null && (
                          <span className="text-[10px] text-slate-500">{formatNumber(p.followerCount)} followers</span>
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
