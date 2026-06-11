'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface AddToWatchlistButtonProps {
  entityType: 'track' | 'artist';
  entityId: number;
  initialAdded?: boolean;
  className?: string;
}

export function AddToWatchlistButton({
  entityType,
  entityId,
  initialAdded = false,
  className,
}: AddToWatchlistButtonProps) {
  const [added, setAdded] = useState(initialAdded);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    setLoading(true);
    setFailed(false);
    try {
      if (added) {
        const res = await fetch(
          `/api/ui/watchlist?entityType=${entityType}&entityId=${entityId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error(`remove failed (${res.status})`);
        setAdded(false);
      } else {
        const res = await fetch('/api/ui/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId }),
        });
        if (!res.ok) throw new Error(`add failed (${res.status})`);
        setAdded(true);
      }
    } catch (err) {
      console.warn('[watchlist-toggle]', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const label = failed
    ? 'Watchlist update failed — click to retry'
    : added
      ? 'Remove from watchlist'
      : 'Add to watchlist';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      disabled={loading}
      aria-label={label}
      title={label}
      className={cn(
        'p-1.5 rounded-md transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        added
          ? 'text-emerald-400 hover:text-rose-400'
          : 'text-slate-500 hover:text-emerald-400',
        failed && 'text-rose-400',
        loading && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={added ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

AddToWatchlistButton.displayName = 'AddToWatchlistButton';
export default AddToWatchlistButton;
