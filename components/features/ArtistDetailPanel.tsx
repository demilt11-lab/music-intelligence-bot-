'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SkeletonBox } from '@/components/ui/Skeleton';
import { PlatformBar } from '@/components/ui/PlatformBar';
import { CompanionMessage } from '@/components/ui/CompanionMessage';
import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';

// Map status strings to existing Badge variants
type StatusStr = string | undefined;

interface ArtistData {
  id: number;
  name: string;
  genre?: string;
  region?: string;
  status?: string;
  breakProbability?: number;
  tiktokViews?: number | null;
  spotifyStreams?: number | null;
  youtubeViews?: number | null;
  instagramPlays?: number | null;
  aiNotes?: string;
  trajectoryWeeks?: number[];
}

export interface ArtistDetailPanelProps {
  /** Artist ID to fetch, or null to hide panel. */
  artistId: number | null;
  /** Called when the panel is dismissed. */
  onClose: () => void;
}

function statusToBadgeVariant(status: StatusStr): BadgeVariant {
  if (!status) return 'default';
  const s = status.toUpperCase();
  if (s.includes('BREAK') || s.includes('VIRAL')) return 'viral';
  if (s.includes('GROW') || s.includes('TREND')) return 'trending';
  if (s.includes('DECLIN')) return 'danger';
  if (s.includes('STABLE')) return 'none';
  return 'default';
}

function BreakProbabilityBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-600';
  const textColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-slate-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Break probability</span>
        <span className={cn('font-semibold tabular-nums', textColor)}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBox className="w-12 h-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <SkeletonBox className="h-5 w-36" />
          <SkeletonBox className="h-3 w-24" />
        </div>
      </div>
      <SkeletonBox className="h-2 w-full rounded-full" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <SkeletonBox className="w-4 h-4" />
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="flex-1 h-1.5 rounded-full" />
            <SkeletonBox className="h-3 w-10" />
          </div>
        ))}
      </div>
      <SkeletonBox className="h-16 w-full rounded-lg" />
    </div>
  );
}

/**
 * Slide-over panel that shows detailed artist metrics and AI insights.
 */
export function ArtistDetailPanel({ artistId, onClose }: ArtistDetailPanelProps) {
  const [artist, setArtist] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId) {
      setArtist(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/artists/${artistId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load artist');
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setArtist(data.obj ?? data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistId]);

  // ESC key handler
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {artistId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-slate-900 border-l border-slate-800 shadow-card-elevated flex flex-col overflow-hidden"
            role="complementary"
            aria-label="Artist details"
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Artist Detail</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1={18} y1={6} x2={6} y2={18} />
                  <line x1={6} y1={6} x2={18} y2={18} />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading && <PanelSkeleton />}

              {error && !loading && (
                <div className="p-6">
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
                    {error}
                  </div>
                </div>
              )}

              {!loading && !error && artist && (
                <div className="p-5 space-y-5">
                  {/* Name + status */}
                  <div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-50 leading-tight">{artist.name}</h2>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                          {artist.genre && <span>{artist.genre}</span>}
                          {artist.genre && artist.region && <span>·</span>}
                          {artist.region && <span>{artist.region}</span>}
                        </div>
                      </div>
                      {artist.status && (
                        <Badge variant={statusToBadgeVariant(artist.status)} dot>
                          {artist.status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Break probability */}
                  {artist.breakProbability !== undefined && (
                    <BreakProbabilityBar value={artist.breakProbability} />
                  )}

                  {/* Platform metrics */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Platform Metrics</p>
                    <div className="space-y-1.5">
                      <PlatformBar platform="tiktok" value={artist.tiktokViews ?? null} maxValue={50_000_000} />
                      <PlatformBar platform="spotify" value={artist.spotifyStreams ?? null} maxValue={10_000_000} />
                      <PlatformBar platform="youtube" value={artist.youtubeViews ?? null} maxValue={10_000_000} />
                      <PlatformBar platform="instagram" value={artist.instagramPlays ?? null} maxValue={1_000_000} />
                    </div>
                  </div>

                  {/* AI notes */}
                  {artist.aiNotes && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">AI Insight</p>
                      <CompanionMessage message={artist.aiNotes} type="insight" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
