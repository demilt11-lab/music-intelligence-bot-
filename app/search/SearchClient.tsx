'use client';

import React, { useState } from 'react';
import Link from 'next/link';

type SearchType = 'all' | 'artists' | 'tracks' | 'playlists' | 'curators' | 'albums' | 'stations' | 'songwriters';

type SearchResultBuckets = {
  artists?: any[];
  tracks?: any[];
  playlists?: any[];
  curators?: any[];
  albums?: any[];
  stations?: any[];
  songwriters?: any[];
};

const TYPES: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artists', label: 'Artists' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'playlists', label: 'Playlists' },
  { value: 'curators', label: 'Curators' },
  { value: 'albums', label: 'Albums' },
  { value: 'stations', label: 'Stations' },
  { value: 'songwriters', label: 'Songwriters' },
];

const BUCKET_ORDER: (keyof SearchResultBuckets)[] = ['tracks', 'artists', 'playlists', 'curators', 'albums', 'stations', 'songwriters'];

function bucketLabel(k: string) {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function ResultRow({ item, bucket }: { item: any; bucket: string }) {
  const name = item.name ?? item.title ?? item.id ?? '—';
  const sub = bucket === 'tracks'
    ? item.artists?.map((a: any) => a.name).join(', ')
    : item.description ?? item.genre ?? null;
  const href = bucket === 'artists' && item.id ? `/artists/${item.id}`
    : bucket === 'tracks' && item.id ? `/tracks/${item.id}`
    : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors border-b border-slate-800/40 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0 text-[10px] font-bold text-slate-500">
        {bucketLabel(bucket).charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link href={href} className="text-sm font-medium text-slate-200 hover:text-emerald-400 transition-colors truncate block">
            {name}
          </Link>
        ) : (
          <span className="text-sm font-medium text-slate-200 truncate block">{name}</span>
        )}
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
      </div>
      {item.score != null && (
        <span className="text-[10px] font-mono text-slate-500 shrink-0">{Number(item.score).toFixed(2)}</span>
      )}
    </div>
  );
}

export default function SearchClient() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<SearchType>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResultBuckets | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q, type });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data.obj);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const totalResults = result ? Object.values(result).reduce((n, b) => n + (b?.length ?? 0), 0) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Companion header */}
      <div className="border-b border-slate-800/60 bg-[#020817]/80 backdrop-blur-sm sticky top-0 z-10 px-6 py-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="relative shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500/20 to-emerald-500/10 border border-sky-500/25 flex items-center justify-center">
              <span className="text-sky-400 text-base" aria-hidden>⌕</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#020817]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-sky-400">Catalog Search</span>
            </div>
            <p className="text-sm text-slate-300">
              {loading ? 'Searching across artists, tracks, playlists, and more…'
                : searched && totalResults === 0 ? "Nothing matched that query — try a different spelling or a direct URL."
                : searched ? `Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${q}".`
                : 'Search across artists, tracks, playlists, curators, radio, and more.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Artist name, track, playlist, or paste a URL…"
            className="flex-1 text-sm bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-colors"
            aria-label="Search query"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SearchType)}
            className="text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 focus:outline-none focus:border-sky-500/40 transition-colors"
            aria-label="Search type"
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/25 hover:bg-sky-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '…' : 'Search'}
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-800/40 shimmer" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <span aria-hidden>⚠</span> {error}
          </div>
        )}

        {!loading && !error && searched && totalResults === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <span className="text-4xl text-slate-700" aria-hidden>⌕</span>
            <p className="text-slate-400 text-sm">No results for "{q}"</p>
            <p className="text-slate-600 text-xs">Try a different spelling, or paste a Spotify / YouTube URL directly.</p>
          </div>
        )}

        {!loading && !error && result && totalResults > 0 && (
          <div className="space-y-4">
            {BUCKET_ORDER.filter((k) => (result[k]?.length ?? 0) > 0).map((bucket) => (
              <section key={bucket}>
                <h2 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium px-1 mb-2">
                  {bucketLabel(bucket)} <span className="text-slate-700">({result[bucket]!.length})</span>
                </h2>
                <div className="rounded-xl border border-slate-800/60 overflow-hidden">
                  {result[bucket]!.map((item, i) => (
                    <ResultRow key={item.id ?? i} item={item} bucket={bucket} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <span className="text-5xl text-slate-800" aria-hidden>⌕</span>
            <p className="text-slate-500 text-sm">Type something above to search the catalog.</p>
          </div>
        )}
      </div>
    </div>
  );
}
