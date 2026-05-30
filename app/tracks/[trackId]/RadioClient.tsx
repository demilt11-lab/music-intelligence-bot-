'use client';

import React, { useEffect, useState } from 'react';
import { PageSection } from '../../ui/components/layout/PageSection';
import { Spinner } from '../../ui/components/feedback/Spinner';
import { ErrorState } from '../../ui/components/feedback/ErrorState';

type AirplayTotals = {
  totalSpins?: number;
  // add fields as needed
};

type BroadcastMarket = {
  marketName: string;
  spins: number;
};

type RadioData = {
  airplayTotals?: AirplayTotals;
  broadcastMarkets?: BroadcastMarket[];
};

type Props = {
  trackId: string;
};

export function RadioClient({ trackId }: Props) {
  const [data, setData] = useState<RadioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/v1/tracks/${trackId}/radio`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to load radio data');
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.obj ?? null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? 'Error loading radio data');
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
      <PageSection title="Radio">
        <Spinner label="Loading radio airplay..." />
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection title="Radio">
        <ErrorState description={error} />
      </PageSection>
    );
  }

  if (!data) {
    return (
      <PageSection title="Radio">
        <p className="text-xs text-slate-400">
          No radio data available.
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection title="Radio">
      {data.airplayTotals && (
        <p className="text-sm text-slate-200">
          Total spins:{' '}
          <span className="font-semibold">
            {data.airplayTotals.totalSpins ?? '—'}
          </span>
        </p>
      )}

      {data.broadcastMarkets?.length ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-300">
          {data.broadcastMarkets.map((m, idx) => (
            <li key={idx}>
              {m.marketName}: {m.spins} spins
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          No broadcast market breakdown available.
        </p>
      )}
    </PageSection>
  );
}
