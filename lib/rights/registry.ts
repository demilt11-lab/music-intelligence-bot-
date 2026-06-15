// Rights Registry Orchestrator.
// Fans out to all data sources and assembles a RightsProfile.

import { db } from '@/lib/db'
import { getSongCodes } from './songCodes'
import { buildWorkRegistrationFromIpis } from './proLookup'
import { getMechanicalRegistration, isHarryFoxAdministered } from './mlcLookup'
import { estimateRoyalties } from './royaltyEstimator'
import type {
  RightsProfile,
  RightsGap,
  SongwriterRightsProfile,
  ProSociety,
} from './types'
import { lookupPublisherByIpi } from './proLookup'

function computeRightsComplexity(profile: Omit<RightsProfile, 'rightsComplexityScore' | 'gaps'>): number {
  let score = 0

  // More parties = more complex
  const writerCount = profile.composition.writers.length
  const pubCount = profile.composition.publishers.length
  score += Math.min(writerCount / 5, 0.3)  // up to 0.30 for 5+ writers
  score += Math.min(pubCount / 3, 0.2)      // up to 0.20 for 3+ publishers

  // Missing identifiers = complexity (unclear ownership)
  if (!profile.isrc) score += 0.1
  if (!profile.iswc) score += 0.1

  // Label without PRO registration = potential unclaimed performance royalties
  const hasPro = profile.composition.writers.some((w) => w.proSociety !== 'UNKNOWN')
  if (!hasPro) score += 0.15

  // Not registered with MLC = unclaimed mechanicals
  if (!profile.mechanical.mlcRegistered) score += 0.15

  return Math.min(score, 1.0)
}

function detectGaps(profile: Omit<RightsProfile, 'rightsComplexityScore' | 'gaps'>): RightsGap[] {
  const gaps: RightsGap[] = []

  if (!profile.isrc) {
    gaps.push({ type: 'MISSING_ISRC', severity: 'critical', description: 'No ISRC found — sound recording cannot be tracked across platforms.' })
  }
  if (!profile.iswc) {
    gaps.push({ type: 'MISSING_ISWC', severity: 'warning', description: 'No ISWC found — composition may not be registered with a PRO.' })
  }

  const hasPro = profile.composition.writers.some((w) => w.proSociety !== 'UNKNOWN')
  if (!hasPro) {
    gaps.push({ type: 'NO_PRO_REGISTRATION', severity: 'critical', description: 'No PRO registration detected — performance royalties (ASCAP/BMI) may be uncollected.' })
  }

  if (!profile.mechanical.mlcRegistered) {
    gaps.push({ type: 'NO_MLC_REGISTRATION', severity: 'critical', description: 'Work not found in MLC registry — mechanical royalties from US on-demand streaming may be uncollected.' })
  }

  if (!profile.soundRecording.label) {
    gaps.push({ type: 'NO_LABEL_DATA', severity: 'warning', description: 'No record label identified — master recording ownership is unclear.' })
  }

  const hasStreams = (profile.royaltyEstimate?.totalStreams ?? 0) > 10_000
  if (hasStreams && !hasPro && !profile.mechanical.mlcRegistered) {
    gaps.push({ type: 'UNCLAIMED_MECHANICAL', severity: 'critical', description: `Track has significant streams but no detected registrations. Royalties are likely going uncollected.` })
  }

  if (profile.composition.publishers.length === 0 && profile.composition.writers.length > 0) {
    gaps.push({ type: 'NO_PUBLISHER', severity: 'warning', description: 'Writers have no publisher affiliated — writers may be self-administered and missing collection infrastructure.' })
  }

  return gaps
}

export async function buildRightsProfile(trackId: number): Promise<RightsProfile> {
  const [codes, stats] = await Promise.all([
    getSongCodes(trackId),
    db.trackStatisticsLatest.findUnique({ where: { trackId } }),
  ])

  const trackRow = await db.track.findUnique({
    where: { id: trackId },
    select: { title: true },
  })
  const trackTitle = trackRow?.title ?? `Track #${trackId}`

  // Fan out to MLC and PRO sources in parallel
  const [workReg, mechanical] = await Promise.all([
    buildWorkRegistrationFromIpis(trackTitle, codes.iswc, codes.songwriterIpis),
    getMechanicalRegistration(trackId, codes.isrc, codes.iswc),
  ])

  // Merge any ISWC discovered by MLC lookup into workReg
  if (mechanical.discoveredIswc && !workReg.iswc) {
    workReg.iswc = mechanical.discoveredIswc
  }

  const royaltyEstimate = stats
    ? estimateRoyalties(
        {
          totalStreams: stats.totalStreams,
          spotifyStreams: stats.totalStreams,
          appleMusicPlays: stats.appleMusicPlays,
          youtubeViews: stats.youtubeViews,
        },
        codes.label,
        mechanical.mlcRegistered,
        workReg.publishers[0]?.name ?? null,
      )
    : null

  const partial = {
    trackId,
    trackTitle,
    isrc: codes.isrc,
    iswc: workReg.iswc ?? codes.iswc,
    soundRecording: {
      isrc: codes.isrc,
      label: codes.label,
      distributor: null,
      soundExchangeRegistered: false, // SoundExchange is for non-interactive; not queried
    },
    composition: {
      ...workReg,
      mlcRegistered: mechanical.mlcRegistered,
      mlcWorkId: mechanical.mlcWorkId,
      harryFoxAdministered: isHarryFoxAdministered(mechanical.mlcRegistered, workReg.publishers.length),
    },
    mechanical,
    royaltyEstimate,
    dataSources: ['database', 'soundcharts', 'mlc_work_registry'],
    fetchedAt: new Date().toISOString(),
  }

  const gaps = detectGaps(partial)
  const rightsComplexityScore = computeRightsComplexity(partial)

  return { ...partial, gaps, rightsComplexityScore }
}

export async function buildSongwriterRightsProfile(songwriterId: number): Promise<SongwriterRightsProfile> {
  const songwriter = await db.songwriter.findUnique({
    where: { id: songwriterId },
    include: {
      tracks: {
        include: {
          track: {
            include: { statisticsLatest: true },
          },
        },
      },
      risingScores: {
        orderBy: { date: 'desc' },
        take: 1,
      },
    },
  })

  if (!songwriter) throw new Error(`Songwriter ${songwriterId} not found`)

  const latestScore = songwriter.risingScores[0]

  // Lookup publisher via IPI
  let publisherName: string | null = null
  let proSociety: ProSociety | null = null

  if (songwriter.ipi) {
    const pub = await lookupPublisherByIpi(songwriter.ipi)
    if (pub) {
      publisherName = pub.publisherName
      proSociety = pub.proSociety !== 'UNKNOWN' ? pub.proSociety : null
    }
  }

  // Estimate annualised royalties across all tracks
  const totalStreams = songwriter.tracks.reduce((sum, st) => {
    return sum + Number(st.track.statisticsLatest?.totalStreams ?? 0)
  }, 0)

  const annualMechanical = totalStreams * 0.00261
  const annualPerformance = totalStreams * 0.004

  const gaps: RightsGap[] = []
  if (!songwriter.ipi) {
    gaps.push({ type: 'NO_PRO_REGISTRATION', severity: 'warning', description: 'No IPI number on file — cannot verify PRO registration.' })
  }
  if (!proSociety) {
    gaps.push({ type: 'NO_PRO_REGISTRATION', severity: 'critical', description: 'Songwriter not affiliated with a PRO (ASCAP/BMI/SESAC) — performance royalties likely uncollected.' })
  }
  if (!publisherName) {
    gaps.push({ type: 'NO_PUBLISHER', severity: 'warning', description: 'No publishing company identified. Songwriter may be self-published with limited collection reach.' })
  }

  return {
    songwriterId,
    songwriterName: songwriter.name,
    ipi: songwriter.ipi ?? null,
    proSociety,
    publisherName,
    isSigned: latestScore?.isSigned ?? false,
    signedLabel: latestScore?.signedLabel ?? null,
    tracksWithRights: songwriter.tracks.length,
    estimatedAnnualMechanical: +annualMechanical.toFixed(2),
    estimatedAnnualPerformance: +annualPerformance.toFixed(2),
    gaps,
    fetchedAt: new Date().toISOString(),
  }
}
