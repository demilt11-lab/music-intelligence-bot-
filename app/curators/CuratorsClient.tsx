// app/curators/CuratorsClient.tsx
'use client';

import React, { useState } from 'react';
import { TextField } from '../ui/components/forms/TextField';
import { Spinner } from '../ui/components/feedback/Spinner';
import { EmptyState } from '../ui/components/feedback/EmptyState';
import { ErrorState } from '../ui/components/feedback/ErrorState';
import { PageSection } from '../ui/components/layout/PageSection';
import { EntityList } from '../ui/components/data/EntityList';

type Curator = {
  id: number;
  name: string;
  platform?: string;
  followerCount?: number;
};

type SearchResponse = {
  obj: {
    curators?: Curator[];
  };
};

export default function CuratorsClient() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curators, setCurators] = useState<Curator[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q, type: 'curators' });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setCurators(data.obj.curators ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setCurators([]);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = curators.length > 0;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            id="curators-q"
            label="Curator search"
            value={q}
            onChange={setQ}
            placeholder="Curator name or URL..."
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
          <Spinner label="Searching curators..." />
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
            title="No curators found"
            description="Try another query or confirm spelling."
          />
        </PageSection>
      )}

      {!loading && !error && hasResults && (
        <PageSection title="Curators">
          <EntityList
            ariaLabel="Curators"
            items={curators.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: c.platform,
              meta:
                c.followerCount != null
                  ? `${c.followerCount} followers`
                  : undefined,
              href: `/curators/${c.id}`,
            }))}
          />
        </PageSection>
      )}
    </>
  );
}
