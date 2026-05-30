// app/playlists/PlaylistsClient.tsx
'use client';

import React, { useState } from 'react';
import { TextField } from '../ui/components/forms/TextField';
import { Spinner } from '../ui/components/feedback/Spinner';
import { EmptyState } from '../ui/components/feedback/EmptyState';
import { ErrorState } from '../ui/components/feedback/ErrorState';
import { PageSection } from '../ui/components/layout/PageSection';
import { EntityList } from '../ui/components/data/EntityList';

type Playlist = {
  id: number;
  name: string;
  curatorName?: string;
  platform?: string;
};

type SearchResponse = {
  obj: {
    playlists?: Playlist[];
  };
};

export default function PlaylistsClient() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q, type: 'playlists' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setPlaylists(data.obj.playlists ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = playlists.length > 0;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            id="playlists-q"
            label="Playlist search"
            value={q}
            onChange={setQ}
            placeholder="Playlist name, curator, or URL..."
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-[38px] items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {loading && (
        <PageSection>
          <Spinner label="Searching playlists..." />
        </PageSection>
      )}

      {error && !loading && (
        <PageSection>
          <ErrorState description={error} />
        </PageSection>
      )}

      {!loading && !error && !hasResults && q && (
        <PageSection>
          <EmptyState
            title="No playlists found"
            description="Try another query or paste a direct playlist URL."
          />
        </PageSection>
      )}

      {!loading && !error && hasResults && (
        <PageSection title="Playlists">
          <EntityList
            ariaLabel="Playlists"
            items={playlists.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: p.curatorName,
              meta: p.platform,
              href: `/playlists/${p.id}`,
            }))}
          />
        </PageSection>
      )}
    </>
  );
}
