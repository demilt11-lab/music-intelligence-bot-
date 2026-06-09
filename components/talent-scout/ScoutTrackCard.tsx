'use client'

import React from 'react'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { PlatformBar } from '@/components/ui/PlatformBar'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

export type ScoutTrack = {
  trackId: number
  rank: number
  name: string
  artists: string[]
  code2: string | null
  totalScore: number
  tiktokViews: string | number
  tiktokVelocity: number
  spotifyPopularity: number | null
  spotifyStreamsLatest: string | null
  luminateStreamsLatest: string | null
  youtubeViews: string | null
  instagramPlays: string | null
  actions: { type: string; description: string; expectedImpact: string }[]
}

interface ScoutTrackCardProps {
  track: ScoutTrack
  index: number
  className?: string
}

function getHeat(score: number): 'hot' | 'rising' | 'cool' {
  if (score >= 0.5) return 'hot'
  if (score >= 0.25) return 'rising'
  return 'cool'
}

const HEAT_STYLES = {
  hot: {
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
    accent: 'from-amber-400/30 via-orange-400/10 to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_18px_40px_rgba(245,158,11,0.14)]',
    label: 'Breakout',
  },
  rising: {
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    accent: 'from-emerald-400/25 via-emerald-500/10 to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_18px_40px_rgba(16,185,129,0.12)]',
    label: 'Rising',
  },
  cool: {
    badge: 'border-white/10 bg-white/5 text-zinc-300',
    accent: 'from-white/10 via-white/[0.03] to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_40px_rgba(0,0,0,0.16)]',
    label: 'Watching',
  },
} as const

function getActionType(type: string): 'insight' | 'action' | 'warning' | 'info' {
  if (type === 'ugc_double_down') return 'insight'
  if (type === 'playlist_pitch') return 'action'
  if (type === 'rights_cleanup') return 'warning'
  return 'info'
}

function getSignalSummary(track: ScoutTrack) {
  if (track.totalScore >= 0.7) {
    return 'High-conviction signal with real breakout urgency.'
  }
  if (track.totalScore >= 0.5) {
    return 'Momentum is strong enough for immediate A&R review.'
  }
  if (track.totalScore >= 0.25) {
    return 'Early movement is forming; monitor closely.'
  }
  return 'Low-friction watchlist candidate for continued tracking.'
}

export function ScoutTrackCard({
  track,
  index,
  className = '',
}: ScoutTrackCardProps) {
  const heat = getHeat(track.totalScore)
  const heatStyle = HEAT_STYLES[heat]
  const primaryAction = track.actions?.[0]
  const tiktokMax = 50_000_000
  const streamMax = 10_000_000
  const rank = index + 1
  const scorePercent = Math.round(track.totalScore * 100)

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-[24px] border border-white/10',
        'bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)]',
        'p-4 transition duration-300 hover:-translate-y-1 hover:border-white/15',
        heatStyle.glow,
        className,
      ].join(' ')}
      aria-label={`Rank ${rank}: ${track.name} by ${track.artists.join(', ')}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${heatStyle.accent}`}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-60" />

      <div className="relative space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex w-11 shrink-0 flex-col items-center justify-start pt-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Rank
            </span>
            <span className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">
              {rank}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {track.code2 ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                  {track.code2}
                </span>
              ) : null}

              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${heatStyle.badge}`}
              >
                {heatStyle.label}
              </span>
            </div>

            <h3 className="mt-3 truncate text-base font-semibold tracking-[-0.02em] text-white">
              {track.name}
            </h3>

            <p className="mt-1 truncate text-sm text-zinc-400">
              {track.artists.join(', ') || 'Unknown artist'}
            </p>

            <p className="mt-3 text-xs leading-5 text-zinc-300">
              {getSignalSummary(track)}
            </p>
          </div>

          <div className="shrink-0">
            <ScoreRing
              score={track.totalScore}
              size={52}
              label={`Score: ${scorePercent}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Conviction
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{scorePercent}/100</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Lead move
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {primaryAction?.expectedImpact || 'Monitor closely'}
            </p>
          </div>
        </div>

        <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Platform read
          </p>

          <div className="space-y-2">
            <PlatformBar
              platform="tiktok"
              value={track.tiktokViews}
              secondaryValue={track.tiktokVelocity !== 0 ? String(track.tiktokVelocity) : null}
              maxValue={tiktokMax}
            />

            <PlatformBar
              platform="spotify"
              value={
                track.spotifyStreamsLatest ??
                (track.spotifyPopularity != null ? `Pop ${track.spotifyPopularity}` : null)
              }
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
        </div>

        {primaryAction ? (
          <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Buddy recommendation
            </p>

            <CompanionMessage
              message={primaryAction.description}
              type={getActionType(primaryAction.type)}
              compact
            />
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default ScoutTrackCard
