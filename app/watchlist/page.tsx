'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { WatchlistGrid, type WatchlistEntry } from '@/components/watchlist/WatchlistGrid';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/watchlist', { headers: { 'x-api-key': API_KEY } });
      if (!res.ok) throw new Error(await res.text());
      const { obj } = await res.json();
      setItems(obj);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(id: number) {
    await fetch(`/api/v1/watchlist/${id}`, { method: 'DELETE', headers: { 'x-api-key': API_KEY } });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleExport() {
    const res = await fetch('/api/v1/watchlist/export?format=csv', { headers: { 'x-api-key': API_KEY } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watchlist-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Watchlist</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track artists and songs with live ML signal updates</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="Export watchlist as CSV"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-900/20 border border-rose-800 p-4 text-rose-300 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <WatchlistGrid items={items} onRemove={handleRemove} />
      )}
    </main>
  );
}
