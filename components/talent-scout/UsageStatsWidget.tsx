'use client';

import React from 'react';
import { formatNumber } from '@/lib/utils';

interface UsageStatsWidgetProps {
  tracksScoutedThisWeek: number;
  watchlistSize: number;
  activeAlerts: number;
}

export function UsageStatsWidget({ tracksScoutedThisWeek, watchlistSize, activeAlerts }: UsageStatsWidgetProps) {
  return (
    <div className="flex items-center gap-5 text-sm" aria-label="Your usage this week">
      <Stat value={formatNumber(tracksScoutedThisWeek)} label="tracks scouted this week" />
      <div className="w-px h-6 bg-slate-800" aria-hidden="true" />
      <Stat value={String(watchlistSize)} label="on your watchlist" />
      <div className="w-px h-6 bg-slate-800" aria-hidden="true" />
      <Stat value={String(activeAlerts)} label="active alerts" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-bold tabular-nums text-slate-100">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

UsageStatsWidget.displayName = 'UsageStatsWidget';
export default UsageStatsWidget;
