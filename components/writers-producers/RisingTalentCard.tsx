'use client'

import React from 'react'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import type { RisingTalentEntry, ClusterEvent } from '@/lib/writersProducers/types'

interface RisingTalentCardProps {
  entry: RisingTalentEntry
  rank: number
  onSelect?: (id: number) => void
}

function formatNumber(n: string | number | null): string {
  if (n == null) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return String(Math.round(num))
}

function creatorLabel(type: RisingTalentEntry['creatorType']): string {
  if (type === 'writer') return 'Songwriter'
  if (type === 'producer') return 'Producer'
  return 'Writer/Producer'
}

function getHeat(score: number) {
  if (score >= 0.65) return 'hot'
  if (score >= 0.35) return 'rising'
  return 'cool'
}

const HEAT_STYLES = {
  hot: {
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
    accent: 'from-amber-400/20 via-orange-400/8 to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.07),0_14px_36px_rgba(245,158,11,0.12)]',
    label: 'Breakout',
  },
  rising: {
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    accent: 'from-emerald-400/20 via-emerald-500/8 to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.07),0_14px_36px_rgba(16,185,129,0.10)]',
    label: 'Rising',
  },
  cool: {
    badge: 'border-white/10 bg-white/5 text-zinc-300',
    accent: 'from-white/8 via-white/[0.02] to-transparent',
    glow: 'shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_36px_rgba(0,0,0,0.14)]',
    label: 'Watching',
  },
} as const

function clusterIcon(type: ClusterEvent['type']): string {
  if (type === 'album') return '💿'
  if (type === 'playlist') return '📋'
  return '📅'
}

function ClusterEventRow({ event }: { event: ClusterEvent }) {
  const isOfficial = event.type === 'playlist' && event.isOfficial
  const followerStr = event.followerCount
    ? ` · ${formatNumber(event.followerCount)} followers`
    : ''

  return (
    <div className="flex items-start gap-2 rounded-[14px] border border-violet-400/15 bg-violet-500/[0.06] px-3 py-2">
      <span className="mt-0.5 shrink-0 text-sm leading-none">{clusterIcon(event.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-violet-300">
            {event.trackCount} song{event.trackCount !== 1 ? 's' : ''}
          </span>
          {isOfficial && (
            <span className="rounded-full border border-violet-400/25 bg-violet-500/15 px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.16em] text-violet-300">
              Editorial
            </span>
          )}
          <span className="truncate text-[10px] text-zinc-400">
            on &ldquo;{event.name}&rdquo;{event.type === 'playlist' ? followerStr : ''}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-zinc-500">
          {event.trackTitles.slice(0, 3).join(', ')}
          {event.trackTitles.length > 3 ? ` +${event.trackTitles.length - 3} more` : ''}
        </p>
      </div>
    </div>
  )
}

export function RisingTalentCard({ entry, rank, onSelect }: RisingTalentCardProps) {
  const heat = getHeat(entry.risingScore)
  const style = HEAT_STYLES[heat]
  const pct = Math.round(entry.risingScore * 100)

  const topTrack = entry.topTracks[0]

  function getBuddyMessage(): { text: string; type: 'insight' | 'action' | 'warning' | 'info' } {
    // Multi-track presence takes priority — it's the strongest breakout signal
    const albumCluster = entry.clusterEvents.find((e) => e.type === 'album')
    const playlistCluster = entry.clusterEvents.find((e) => e.type === 'playlist')
    const weeklyBurst = entry.clusterEvents.find((e) => e.type === 'weekly_release')

    const mlProb = entry.mlBreakoutProb30d
    if (mlProb != null && mlProb > 0.75) {
      return {
        text: `ML model gives ${Math.round(mlProb * 100)}% breakout probability within 30 days — one of our highest confidence signals this week.`,
        type: 'insight',
      }
    }

    if (albumCluster) {
      return {
        text: `Credited on ${albumCluster.trackCount} songs from "${albumCluster.name}" — new-album concentration is a strong pipeline signal.`,
        type: 'insight',
      }
    }
    if (playlistCluster && playlistCluster.isOfficial) {
      return {
        text: `${playlistCluster.trackCount} songs on "${playlistCluster.name}" — editorial playlist presence at this density is rare and bullish.`,
        type: 'insight',
      }
    }
    if (weeklyBurst && weeklyBurst.trackCount >= 3) {
      return {
        text: `${weeklyBurst.trackCount} releases in a single week — unusually active pipeline. Track their upcoming projects now.`,
        type: 'action',
      }
    }
    if (!entry.isSigned && entry.risingScore >= 0.6) {
      return {
        text: `Unsigned and rising fast — prime acquisition window for ${entry.name}. Reach out before a label does.`,
        type: 'insight',
      }
    }
    if (entry.isSigned) {
      return {
        text: `Signed to ${entry.signedLabel ?? 'a label'}. Monitor for co-write opportunities on independent releases.`,
        type: 'info',
      }
    }
    if (entry.playlistMomentum && entry.playlistMomentum > 0.4) {
      return {
        text: 'Strong playlist momentum — songs are being curated across multiple editorial playlists.',
        type: 'action',
      }
    }
    return {
      text: `${entry.creatorType === 'producer' ? 'Production' : 'Writing'} catalog is building steam across streaming platforms.`,
      type: 'info',
    }
  }

  const buddy = getBuddyMessage()

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-[22px] border border-white/10',
        'bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)]',
        'p-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/15',
        onSelect ? 'cursor-pointer' : '',
        style.glow,
      ].join(' ')}
      onClick={() => onSelect?.(entry.songwriterId)}
      aria-label={`Rank ${rank}: ${entry.name}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${style.accent}`}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-60" />

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex w-10 shrink-0 flex-col items-center justify-start pt-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              #
            </span>
            <span className="mt-0.5 text-xl font-semibold tracking-[-0.04em] text-white tabular-nums">
              {rank}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${style.badge}`}
              >
                {style.label}
              </span>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-violet-300">
                {creatorLabel(entry.creatorType)}
              </span>
              {!entry.isSigned && (
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300">
                  Unsigned
                </span>
              )}
              {entry.region && entry.region !== 'GLOBAL' && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                  {entry.region}
                </span>
              )}
              {entry.mlBreakoutProb30d != null && entry.mlBreakoutProb30d > 0.6 && (
                <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-300">
                  ML {Math.round(entry.mlBreakoutProb30d * 100)}%
                </span>
              )}
            </div>

            <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-white">
              {entry.name}
            </h3>

            {entry.notableCollaborators.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-zinc-400">
                with {entry.notableCollaborators.join(', ')}
              </p>
            )}
          </div>

          <div className="shrink-0">
            <ScoreRing score={entry.risingScore} size={48} label={`Rising score ${pct}`} />
          </div>
        </div>

        {/* Signal bars */}
        <div className="grid grid-cols-5 gap-1.5">
          {(
            [
              { label: 'Streams', value: entry.streamVelocity },
              { label: 'Playlists', value: entry.playlistMomentum },
              { label: 'Collabs', value: entry.collaborationScore },
              { label: 'UGC', value: entry.ugcMomentum },
              { label: 'Multi-Track', value: entry.multiTrackPresence, highlight: (entry.multiTrackPresence ?? 0) > 0.3 },
            ] as { label: string; value: number | null; highlight?: boolean }[]
          ).map(({ label, value, highlight }) => (
            <div
              key={label}
              className={[
                'rounded-xl border px-1.5 py-2 text-center',
                highlight
                  ? 'border-violet-400/25 bg-violet-500/10'
                  : 'border-white/10 bg-white/[0.03]',
              ].join(' ')}
            >
              <p className={`text-[9px] uppercase tracking-[0.16em] ${highlight ? 'text-violet-400' : 'text-zinc-500'}`}>
                {label}
              </p>
              <div className="mx-auto mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${highlight ? 'bg-violet-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
                />
              </div>
              <p className={`mt-1 text-[10px] font-medium ${highlight ? 'text-violet-300' : 'text-zinc-300'}`}>
                {value != null ? `${Math.round(value * 100)}` : '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Cluster events — evidence for multi-track presence */}
        {entry.clusterEvents.length > 0 && (
          <div className="space-y-1.5">
            {entry.clusterEvents.slice(0, 3).map((ev, i) => (
              <ClusterEventRow key={i} event={ev} />
            ))}
          </div>
        )}

        {/* Top track */}
        {topTrack && (
          <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-2.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.20em] text-zinc-500">
              Top track
            </p>
            <p className="truncate text-sm font-medium text-white">{topTrack.title}</p>
            {topTrack.artists.length > 0 && (
              <p className="truncate text-xs text-zinc-400">{topTrack.artists.join(', ')}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {topTrack.topPlaylist && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">
                  {topTrack.topPlaylist}
                </span>
              )}
              {topTrack.chartRank && (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-300">
                  Chart #{topTrack.chartRank}
                </span>
              )}
              {topTrack.streams7d && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">
                  {formatNumber(topTrack.streams7d)} 7d streams
                </span>
              )}
            </div>
          </div>
        )}

        {/* Buddy message */}
        <CompanionMessage message={buddy.text} type={buddy.type} compact />
      </div>
    </article>
  )
}

export default RisingTalentCard
