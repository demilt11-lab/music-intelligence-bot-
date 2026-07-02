'use client'

import React from 'react'
import type { Collaboration } from '@/lib/writersProducers/types'

interface CollaborationCardProps {
  collab: Collaboration
}

function formatNumber(n: string | number | null): string {
  if (n == null) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return String(Math.round(num))
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: 'text-emerald-300 border-emerald-400/20 bg-emerald-500/8',
  youtube: 'text-red-300 border-red-400/20 bg-red-500/8',
  soundcloud: 'text-orange-300 border-orange-400/20 bg-orange-500/8',
  apple_music: 'text-pink-300 border-pink-400/20 bg-pink-500/8',
  tiktok: 'text-violet-300 border-violet-400/20 bg-violet-500/8',
  billboard: 'text-amber-300 border-amber-400/20 bg-amber-500/8',
}

function platformClass(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? 'text-zinc-300 border-white/10 bg-white/5'
}

export function CollaborationCard({ collab }: CollaborationCardProps) {
  const hasCharts = collab.chartPositions.length > 0
  const hasPlaylists = collab.playlists.length > 0

  return (
    <div className="rounded-[20px] border border-white/10 bg-[rgba(18,18,20,0.96)] p-4 space-y-3">
      {/* Track header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-white">{collab.trackTitle}</h4>
          {collab.coCreators.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {collab.coCreators.map((c) => c.name).join(', ')}
            </p>
          )}
          {collab.releaseDate && (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Released {collab.releaseDate.slice(0, 7)}
            </p>
          )}
        </div>

        {/* Stats bubble */}
        <div className="shrink-0 text-right">
          {collab.totalStreams && (
            <p className="text-xs font-semibold text-white">{formatNumber(collab.totalStreams)}</p>
          )}
          <p className="text-[10px] text-zinc-500">streams</p>
        </div>
      </div>

      {/* Platform stats */}
      <div className="flex flex-wrap gap-2">
        {collab.tiktokViews && (
          <span className="rounded-full border border-violet-400/20 bg-violet-500/8 px-2 py-0.5 text-[10px] text-violet-300">
            TikTok {formatNumber(collab.tiktokViews)}
          </span>
        )}
        {collab.youtubeViews && (
          <span className="rounded-full border border-red-400/20 bg-red-500/8 px-2 py-0.5 text-[10px] text-red-300">
            YouTube {formatNumber(collab.youtubeViews)}
          </span>
        )}
      </div>

      {/* Chart positions */}
      {hasCharts && (
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.20em] text-zinc-500">
            Chart positions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {collab.chartPositions.slice(0, 4).map((cp, i) => (
              <span
                key={i}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${platformClass(cp.platform)}`}
              >
                #{cp.rank} {cp.chartType} · {cp.platform}
                {cp.peakRank && cp.peakRank < cp.rank ? ` (peak #${cp.peakRank})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Playlists */}
      {hasPlaylists && (
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.20em] text-zinc-500">
            Playlists ({collab.playlists.length})
          </p>
          <div className="space-y-1">
            {collab.playlists.slice(0, 4).map((pl, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <span
                    className={`mr-1.5 inline-block rounded-full border px-1.5 py-px text-[9px] font-medium uppercase ${platformClass(pl.platform)}`}
                  >
                    {pl.platform}
                  </span>
                  <span className="truncate text-xs text-zinc-200">{pl.playlistName}</span>
                  {pl.isOfficial && (
                    <span className="ml-1.5 text-[9px] text-emerald-400">✓ Editorial</span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {pl.trackPosition != null && (
                    <p className="text-[10px] text-zinc-400">#{pl.trackPosition}</p>
                  )}
                  {pl.followerCount && (
                    <p className="text-[10px] text-zinc-500">{formatNumber(pl.followerCount)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Co-creators detail */}
      {collab.coCreators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {collab.coCreators.slice(0, 5).map((c, i) => (
            <span
              key={i}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300"
            >
              {c.name}
              {c.role ? ` · ${c.role}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default CollaborationCard
