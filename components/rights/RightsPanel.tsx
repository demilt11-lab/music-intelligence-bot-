'use client'

import React, { useEffect, useState } from 'react'
import type { RightsProfile, SongwriterRightsProfile, RightsGap } from '@/lib/rights/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtStreams(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const GAP_SEVERITY_STYLES: Record<RightsGap['severity'], string> = {
  critical: 'border-red-400/20 bg-red-500/8 text-red-300',
  warning: 'border-amber-400/20 bg-amber-500/8 text-amber-200',
  info: 'border-white/10 bg-white/5 text-zinc-300',
}
const GAP_ICON: Record<RightsGap['severity'], string> = {
  critical: '⚠',
  warning: '!',
  info: '·',
}

function GapRow({ gap }: { gap: RightsGap }) {
  return (
    <div className={`flex items-start gap-2 rounded-[12px] border px-3 py-2 ${GAP_SEVERITY_STYLES[gap.severity]}`}>
      <span className="mt-0.5 shrink-0 text-xs">{GAP_ICON[gap.severity]}</span>
      <p className="text-xs leading-5">{gap.description}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{title}</p>
      {children}
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-white/6 bg-white/[0.02] px-3 py-1.5">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="text-right text-xs font-medium text-zinc-200">{value ?? '—'}</span>
    </div>
  )
}

function RegistrationDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
  )
}

// ── Track rights panel ────────────────────────────────────────────────────────

interface TrackRightsPanelProps {
  profile: RightsProfile
}

function TrackRightsPanel({ profile }: TrackRightsPanelProps) {
  const est = profile.royaltyEstimate
  const writers = profile.composition.writers
  const publishers = profile.composition.publishers

  return (
    <div className="space-y-5">
      {/* Identifiers */}
      <Section title="Song Codes">
        <DataRow label="ISRC (Recording)" value={profile.isrc ?? <span className="text-red-400">Missing</span>} />
        <DataRow label="ISWC (Composition)" value={profile.iswc ?? <span className="text-amber-400">Not found</span>} />
      </Section>

      {/* Sound recording */}
      <Section title="Sound Recording (Master)">
        <DataRow label="Record Label" value={profile.soundRecording.label ?? <span className="text-zinc-500">Unknown</span>} />
        <DataRow label="SoundExchange"
          value={
            <span className="flex items-center gap-1.5">
              <RegistrationDot ok={profile.soundRecording.soundExchangeRegistered} />
              {profile.soundRecording.soundExchangeRegistered ? 'Registered' : 'Not detected'}
            </span>
          }
        />
      </Section>

      {/* Composition / PRO */}
      <Section title="Composition (Publishing)">
        <DataRow label="MLC Registered"
          value={
            <span className="flex items-center gap-1.5">
              <RegistrationDot ok={profile.composition.mlcRegistered} />
              {profile.composition.mlcRegistered
                ? `Yes · ${profile.composition.mlcWorkId ?? 'Work ID unknown'}`
                : 'Not found'}
            </span>
          }
        />
        <DataRow label="Harry Fox / Admin" value={profile.mechanical.harryFoxAdministered ? 'Administered' : 'Not detected'} />
        {writers.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-[0.16em]">Writers & PRO Affiliation</p>
            {writers.map((w, i) => (
              <div key={i} className="flex items-center justify-between rounded-[10px] border border-white/6 bg-white/[0.02] px-3 py-1.5">
                <span className="text-xs text-zinc-300">{w.name}</span>
                <div className="flex items-center gap-1.5">
                  {w.proSociety !== 'UNKNOWN' ? (
                    <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">
                      {w.proSociety}
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-600">No PRO</span>
                  )}
                  {w.ipi && <span className="text-[9px] text-zinc-600">IPI {w.ipi}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {publishers.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-[0.16em]">Publishers</p>
            {publishers.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-[10px] border border-white/6 bg-white/[0.02] px-3 py-1.5">
                <span className="text-xs text-zinc-300">{p.name}</span>
                {p.proSociety !== 'UNKNOWN' && (
                  <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-300">
                    {p.proSociety}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Royalty estimates */}
      {est && (
        <Section title={`Royalty Estimates · ${fmtStreams(est.totalStreams)} lifetime streams`}>
          <DataRow label="Mechanical (MLC)" value={
            <span className="text-emerald-300">{fmt(est.estimatedMechanical)}</span>
          } />
          <DataRow label="Performance (PRO)" value={
            <span className="text-emerald-300">{fmt(est.estimatedPerformance)}</span>
          } />
          <DataRow label="Master Royalty (Label)" value={
            <span className="text-emerald-300">{fmt(est.estimatedMasterRoyalty)}</span>
          } />
          <div className="mt-1 flex items-center justify-between rounded-[10px] border border-emerald-400/15 bg-emerald-500/8 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-300">Estimated Total</span>
            <span className="text-sm font-bold text-emerald-300">{fmt(est.estimatedTotal)}</span>
          </div>
          <p className="text-[9px] leading-4 text-zinc-600">
            Estimates use US statutory rates (2025). Actual payments depend on territory, platform agreements, and admin fees.
          </p>
        </Section>
      )}

      {/* Rights gaps */}
      {profile.gaps.length > 0 && (
        <Section title={`Rights Gaps · ${profile.gaps.length} issue${profile.gaps.length !== 1 ? 's' : ''}`}>
          <div className="space-y-1.5">
            {profile.gaps.map((gap, i) => <GapRow key={i} gap={gap} />)}
          </div>
        </Section>
      )}

      {/* Data sources */}
      <p className="text-[9px] text-zinc-700">
        Sources: {profile.dataSources.join(', ')} · Fetched {new Date(profile.fetchedAt).toLocaleDateString()}
      </p>
    </div>
  )
}

// ── Songwriter rights panel ───────────────────────────────────────────────────

interface SongwriterRightsPanelProps {
  profile: SongwriterRightsProfile
}

function SongwriterRightsPanel({ profile }: SongwriterRightsPanelProps) {
  return (
    <div className="space-y-5">
      <Section title="Registration">
        <DataRow label="IPI Number" value={profile.ipi ?? <span className="text-amber-400">Not on file</span>} />
        <DataRow label="PRO Affiliation" value={
          profile.proSociety
            ? <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-semibold text-indigo-300">{profile.proSociety}</span>
            : <span className="text-red-400">None detected</span>
        } />
        <DataRow label="Publisher" value={profile.publisherName ?? <span className="text-amber-400">Self-published / unknown</span>} />
      </Section>

      <Section title="Label Status">
        <DataRow label="Signed" value={profile.isSigned
          ? <span className="text-emerald-300">{profile.signedLabel ?? 'Yes'}</span>
          : <span className="text-zinc-400">Unsigned</span>
        } />
        <DataRow label="Tracks in Catalog" value={profile.tracksWithRights} />
      </Section>

      <Section title="Estimated Annual Royalties (All Tracks)">
        <DataRow label="Mechanical (MLC)" value={<span className="text-emerald-300">{fmt(profile.estimatedAnnualMechanical)}</span>} />
        <DataRow label="Performance (PRO)" value={<span className="text-emerald-300">{fmt(profile.estimatedAnnualPerformance)}</span>} />
        <div className="flex items-center justify-between rounded-[10px] border border-emerald-400/15 bg-emerald-500/8 px-3 py-2">
          <span className="text-xs font-semibold text-zinc-300">Estimated Total</span>
          <span className="text-sm font-bold text-emerald-300">
            {fmt(profile.estimatedAnnualMechanical + profile.estimatedAnnualPerformance)}
          </span>
        </div>
      </Section>

      {profile.gaps.length > 0 && (
        <Section title={`Gaps · ${profile.gaps.length}`}>
          <div className="space-y-1.5">
            {profile.gaps.map((gap, i) => <GapRow key={i} gap={gap} />)}
          </div>
        </Section>
      )}
    </div>
  )
}

// ── Public export: smart panel ────────────────────────────────────────────────

interface RightsPanelProps {
  /** Fetch track rights by track ID */
  trackId?: number
  /** Fetch songwriter rights by songwriter ID */
  songwriterId?: number
  /** Pre-loaded profile (skips fetch) */
  profile?: RightsProfile | SongwriterRightsProfile
  className?: string
}

export function RightsPanel({ trackId, songwriterId, profile: initialProfile, className = '' }: RightsPanelProps) {
  const [profile, setProfile] = useState<RightsProfile | SongwriterRightsProfile | null>(initialProfile ?? null)
  const [loading, setLoading] = useState(!initialProfile)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialProfile) return
    if (!trackId && !songwriterId) return

    const url = trackId
      ? `/api/rights/${trackId}`
      : `/api/rights/songwriter/${songwriterId}`

    setLoading(true)
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setProfile(data.obj)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [trackId, songwriterId, initialProfile])

  return (
    <div
      className={[
        'rounded-[22px] border border-white/10',
        'bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)]',
        'p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_36px_rgba(0,0,0,0.14)]',
        className,
      ].join(' ')}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">Rights &amp; Royalties</span>
        <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-300">
          Intelligence
        </span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-[10px] bg-white/5" />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-[12px] border border-red-400/20 bg-red-500/8 px-3 py-2 text-xs text-red-300">
          Failed to load rights data: {error}
        </p>
      )}

      {!loading && !error && profile && (
        'trackId' in profile
          ? <TrackRightsPanel profile={profile as RightsProfile} />
          : <SongwriterRightsPanel profile={profile as SongwriterRightsProfile} />
      )}
    </div>
  )
}

export default RightsPanel
