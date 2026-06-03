'use client';

import React from 'react';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { PlatformBar } from '@/components/ui/PlatformBar';
import { CompanionMessage } from '@/components/ui/CompanionMessage';

export type ScoutTrack = {
  trackId: number;
  rank: number;
  name: string;
  artists: string[];
  code2: string | null;
  totalScore: number;
  tiktokViews: string | number;
  tiktokVelocity: number;
  spotifyPopularity: number | null;
  spotifyStreamsLatest: string | null;
  luminateStreamsLatest: string | null;
  youtubeViews: string | null;
  instagramPlays: string | null;
  actions: { type: string; description: string; expectedImpact: string }[];
};

interface ScoutTrackCardProps {
  track: ScoutTrack;
  index: number;
  className?: string;
}

function getHeat(score: number): 'hot' | 'rising' | 'cool' {
  if (score >= 0.5) return 'hot';
  if (score >= 0.25) return 'rising';
  return 'cool';
}

const HEAT_STYLES = {
  hot:    { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       hoverShadow: '0 0 20px -2px rgb(245 158 11 / 0.4)', label: '🔥 Hot' },
  rising: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', hoverShadow: '0 0 20px -2px rgb(16 185 129 / 0.4)', label: '↑ Rising' },
  cool:   { badge: 'bg-slate-700/40 text-slate-400 border-slate-700/20',       hoverShadow: '',                                    label: 'Watching' },
};

function getActionType(type: string): 'insight' | 'action' | 'warning' | 'info' {
  if (type === 'ugc_double_down') return 'insight';
  if (type === 'playlist_pitch') return 'action';
  if (type === 'rights_cleanup') return 'warning';
  return 'info';
}

export function ScoutTrackCard({ track, index, className = '' }: ScoutTrackCardProps) {
  const heat = getHeat(track.totalScore);
  const heatStyle = HEAT_STYLES[heat];
  const primaryAction = track.actions?.[0];
  const [hovered, setHovered] = React.useState(false);

  const tiktokMax = 50_000_000;
  const streamMax = 10_000_000;

  return (
    <article
      className={`group relative rounded-xl transition-all duration-200 hover:-translate-y-0.5 ${heat === 'hot' ? 'gradient-border-hot' : 'gradient-border'} ${className}`}
      style={hovered && heatStyle.hoverShadow ? { boxShadow: heatStyle.hoverShadow } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Rank ${index + 1}: ${track.name} by ${track.artists.join(', ')}`}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0 w-8">
            <span className="text-lg font-bold text-slate-200 leading-none tabular-nums">{index + 1}</span>
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-50 truncate text-sm leading-snug">
              {track.name}
            </h3>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {track.artists.join(', ') || 'Unknown artist'}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {track.code2 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                  {track.code2}
                </span>
              )}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${heatStyle.badge}`}>
                {heatStyle.label}
              </span>
            </div>
          </div>

          {/* Score ring */}
          <div className="shrink-0">
            <ScoreRing score={track.totalScore} size={44} label={`Score: ${Math.round(track.totalScore * 100)}`} />
          </div>
        </div>

        {/* Platform metrics */}
        <div className="space-y-1 pt-0.5">
          <PlatformBar
            platform="tiktok"
            value={track.tiktokViews}
            secondaryValue={track.tiktokVelocity !== 0 ? String(track.tiktokVelocity) : null}
            maxValue={tiktokMax}
          />
          <PlatformBar
            platform="spotify"
            value={track.spotifyStreamsLatest ?? (track.spotifyPopularity != null ? `Pop ${track.spotifyPopularity}` : null)}
            maxValue={streamMax}
          />
          <PlatformBar
            platform="youtube"
            value={track.youtubeViews}
            maxValue={streamMax}
          />
          <PlatformBar
            platform="instagram"
            value={track.instagramPlays}
            maxValue={1_000_000}
          />
        </div>

        {/* AI action suggestion */}
        {primaryAction && (
          <CompanionMessage
            message={primaryAction.description}
            type={getActionType(primaryAction.type)}
            compact
          />
        )}
      </div>
    </article>
  );
}
