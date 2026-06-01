'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ViralScoreGauge } from '@/components/music/ViralScoreGauge';
import { formatNumber } from '@/lib/utils';

export interface WatchlistEntry {
  id: number;
  entityType: string;
  entityId: number;
  addedAt: string;
  viralScore: number | null;
  viralScoreDelta: number | null;
  trendLabel: string | null;
}

interface WatchlistGridProps {
  items: WatchlistEntry[];
  onRemove: (id: number) => void;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const pct = (delta * 100).toFixed(1);
  const positive = delta >= 0;
  return (
    <span className={`text-2xs font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
      {positive ? '+' : ''}{pct}%
    </span>
  );
}

export function WatchlistGrid({ items, onRemove }: WatchlistGridProps) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <p className="text-sm">Your watchlist is empty.</p>
        <p className="text-xs text-slate-600">Star any track or artist from the A&R Radar to track it here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <Card key={item.id} variant="default" className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Badge variant="info" size="sm">
                {item.entityType}
              </Badge>
              <span className="text-xs text-slate-500 font-mono">#{item.entityId}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <DeltaBadge delta={item.viralScoreDelta} />
              {item.trendLabel && (
                <Badge variant={item.trendLabel === 'VIRAL' ? 'viral' : 'trending'} size="sm">
                  {item.trendLabel}
                </Badge>
              )}
            </div>
            <p className="text-2xs text-slate-600 mt-1">
              Added {new Date(item.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>

          {item.viralScore != null && (
            <ViralScoreGauge score={item.viralScore} size={44} showLabel animated />
          )}

          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove from watchlist"
            className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Card>
      ))}
    </div>
  );
}

WatchlistGrid.displayName = 'WatchlistGrid';
export default WatchlistGrid;
