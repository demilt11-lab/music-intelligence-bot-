// Royalty estimation from streaming data.
// Rates are US market estimates based on current statutory/market rates (2025-2026).
// These are ESTIMATES — actual payments depend on platform agreements, territory,
// label splits, and publisher admin fees.

import type { RoyaltyEstimate, RoyaltyRate } from './types'

// Current US market rate estimates per stream (USD)
// Sources: NMPA/MLC statutory rate filings, streaming platform transparency reports
const DEFAULT_RATES: RoyaltyRate = {
  // Statutory mechanical rate: $0.00261/stream (US, 2024-2027 CRB Phonorecords IV)
  mechanicalPerStream: 0.00261,
  // PRO performance royalty (ASCAP/BMI): ~$0.004/stream average across all US on-demand
  performancePerStream: 0.004,
  // Master recording (label share): ~$0.004/stream after platform fees
  // (Spotify pays ~$0.004/stream total to rights holders; ~60% to labels = $0.0024)
  masterPerStream: 0.0024,
  // SoundExchange non-interactive digital (Pandora, satellite): not applicable to on-demand
  // Included for completeness at $0 for on-demand streams
  soundExchangePerStream: 0,
}

export interface StreamData {
  totalStreams: bigint | number | null
  spotifyStreams?: bigint | number | null
  appleMusicPlays?: bigint | number | null
  youtubeViews?: bigint | number | null
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'bigint' ? Number(v) : v
}

export function estimateRoyalties(
  streams: StreamData,
  label: string | null,
  mlcRegistered: boolean,
  publisherName: string | null,
  windowDays = 365,
): RoyaltyEstimate {
  const total = toNumber(streams.totalStreams)
  const rates = { ...DEFAULT_RATES }

  const mech = total * rates.mechanicalPerStream
  const perf = total * rates.performancePerStream
  const master = total * rates.masterPerStream

  return {
    windowDays,
    totalStreams: total,
    rates,
    estimatedMechanical: +mech.toFixed(2),
    estimatedPerformance: +perf.toFixed(2),
    estimatedMasterRoyalty: +master.toFixed(2),
    estimatedTotal: +(mech + perf + master).toFixed(2),
    mechanicalCollector: mlcRegistered ? 'MLC' : (publisherName ?? null),
    performanceCollector: null, // determined by writer PRO affiliation in WorkRegistration
    masterCollector: label,
  }
}

// Annualise from whatever window we have (lifetime streams as a proxy)
export function annualiseEstimate(estimate: RoyaltyEstimate): RoyaltyEstimate {
  if (estimate.windowDays <= 0 || estimate.windowDays === 365) return estimate
  const factor = 365 / estimate.windowDays
  return {
    ...estimate,
    windowDays: 365,
    totalStreams: Math.round(estimate.totalStreams * factor),
    estimatedMechanical: +(estimate.estimatedMechanical * factor).toFixed(2),
    estimatedPerformance: +(estimate.estimatedPerformance * factor).toFixed(2),
    estimatedMasterRoyalty: +(estimate.estimatedMasterRoyalty * factor).toFixed(2),
    estimatedTotal: +(estimate.estimatedTotal * factor).toFixed(2),
  }
}
