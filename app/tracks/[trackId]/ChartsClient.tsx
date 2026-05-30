'use client';

import React, { useEffect, useState } from 'react';
import { PageSection } from '../../ui/components/layout/PageSection';
import { Spinner } from '../../ui/components/feedback/Spinner';
import { ErrorState } from '../../ui/components/feedback/ErrorState';

type ChartEntry = {
  chartType: string;
  rank: number;
  date: string;
  market?: string;
};

type Props = {
  trackId: string;
};

export function ChartsClient({ trackId }: Props) {
  const [data, setData] = useState<ChartEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/v1/tracks/${trackId}/charts`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to load charts');
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.obj ?? []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? 'Error loading charts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (loading) {
    return (
      <PageSection title="Charts">
        <Spinner label="Loading chart history..." />
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection title="Charts">
        <ErrorState description={error} />
      </PageSection>
    );
  }

  if (!data?.length) {
    return (
      <PageSection title="Charts">
        <p className="text-xs text-slate-400">
          No chart history available.
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection title="Charts">
      <ul className="space-y-1 text-xs text-slate-200">
        {data.map((entry, idx) => (
          <li key={idx}>
            <span className="text-slate-300">
              {entry.chartType}
            </span>{' '}
            – rank {entry.rank} on {entry.date}
            {entry.market ? ` (${entry.market})` : ''}
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
