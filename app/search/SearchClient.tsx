// app/search/SearchClient.tsx
'use client';

import React, { useState } from 'react';
import { TextField } from '../ui/components/forms/TextField';
import { Spinner } from '../ui/components/feedback/Spinner';
import { EmptyState } from '../ui/components/feedback/EmptyState';
import { ErrorState } from '../ui/components/feedback/ErrorState';
import { PageSection } from '../ui/components/layout/PageSection';
import { DataTable } from '../ui/components/data/DataTable';

type SearchType =
  | 'all'
  | 'artists'
  | 'tracks'
  | 'playlists'
  | 'curators'
  | 'albums'
  | 'stations'
  | 'cities'
  | 'songwriters';

type SearchResultBuckets = {
  artists?: any[];
  tracks?: any[];
  playlists?: any[];
  curators?: any[];
  albums?: any[];
  stations?: any[];
  cities?: any[];
  songwriters?: any[];
};

type SearchResponse = {
  obj: SearchResultBuckets;
};

export default function SearchClient() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<SearchType>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResultBuckets | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q, type });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Search failed');
      }
      const data = (await res.json()) as SearchResponse;
      setResult(data.obj);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const hasResults =
    result &&
    Object.values(result).some(
      (bucket) => Array.isArray(bucket) && bucket.length > 0
    );

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            id="search-q"
            label="Search query"
            value={q}
            onChange={setQ}
            placeholder="Artist, track, playlist, curator, URL..."
          />
        </div>

        <div className="flex flex-col gap-2 sm:w-56">
          <label
            htmlFor="search-type"
            className="text-xs font-medium text-slate-200"
          >
            Type
          </label>
          <select
            id="search-type"
            value={type}
            onChange={(e) => setType(e.target.value as SearchType)}
            className="h-[38px] rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All</option>
            <option value="artists">Artists</option>
            <option value="tracks">Tracks</option>
            <option value="playlists">Playlists</option>
            <option value="curators">Curators</option>
            <option value="albums">Albums</option>
            <option value="stations">Stations</option>
            <option value="cities">Cities</option>
            <option value="songwriters">Songwriters</option>
          </select>
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
          <Spinner label="Searching catalog..." />
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
            title="No results found"
            description="Try a different query, or paste a direct URL from Spotify, YouTube, or TikTok."
          />
        </PageSection>
      )}

      {!loading && !error && hasResults && (
        <>
          {result?.tracks && result.tracks.length > 0 && (
            <PageSection
              title="Tracks"
              description="Top matching tracks across platforms."
            >
              <DataTable
                ariaLabel="Track search results"
                columns={[
                  { key: 'name', header: 'Track' },
                  {
                    key: 'artists',
                    header: 'Artist',
                    render: (row: any) =>
                      row.artists?.map((a: any) => a.name).join(', ') || '—',
                  },
                  { key: 'isrc', header: 'ISRC' },
                  {
                    key: 'score',
                    header: 'Score',
                    render: (row: any) => row.score ?? '—',
                  },
                ]}
                rows={result.tracks}
              />
            </PageSection>
          )}
        </>
      )}
    </>
  );
}
