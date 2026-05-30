// app/songwriters/SongwritersClient.tsx
'use client';

import React, { useState } from 'react';
import { TextField } from '../ui/components/forms/TextField';
import { Spinner } from '../ui/components/feedback/Spinner';
import { EmptyState } from '../ui/components/feedback/EmptyState';
import { ErrorState } from '../ui/components/feedback/ErrorState';
import { PageSection } from '../ui/components/layout/PageSection';
import { EntityList } from '../ui/components/data/EntityList';

type Songwriter = {
  id: number;
  name: string;
  country?: string;
};

type SearchResponse = {
  obj: {
    songwriters?: Songwriter[];
  };
};

export default function SongwritersClient() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songwriters, setSongwriters] = useState<Songwriter[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q, type: 'songwriters' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setSongwriters(data.obj.songwriters ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setSongwriters([]);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = songwriters.length > 0;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            id="songwriters-q"
            label="Songwriter search"
            value={q}
            onChange={setQ}
            placeholder="Songwriter name..."
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
          <Spinner label="Searching songwriters..." />
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
            title="No songwriters found"
            description="Try another query or confirm spelling."
          />
        </PageSection>
      )}

      {!loading && !error && hasResults && (
        <PageSection title="Songwriters">
          <EntityList
            ariaLabel="Songwriters"
            items={songwriters.map((s) => ({
              id: s.id,
              title: s.name,
              subtitle: s.country,
              href: `/songwriters/${s.id}/catalog`,
            }))}
          />
        </PageSection>
      )}
    </>
  );
}
