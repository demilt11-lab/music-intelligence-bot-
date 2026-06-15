// Rights & Royalty Intelligence types
// Covers sound recording rights (label/SoundExchange) and
// composition rights (PRO/MLC/Harry Fox) separately.

export type ProSociety = 'BMI' | 'ASCAP' | 'SESAC' | 'GMR' | 'UNKNOWN'

export interface PublisherRegistration {
  ipi: string | null
  name: string
  proSociety: ProSociety
  role: 'publisher' | 'sub-publisher' | 'administrator'
  soundchartsUuid?: string
}

export interface WriterRegistration {
  ipi: string | null
  name: string
  proSociety: ProSociety
  role: string // 'songwriter' | 'composer' | 'lyricist' | 'adapter'
  share?: number // percentage 0-100
}

export interface WorkRegistration {
  iswc: string | null
  title: string
  writers: WriterRegistration[]
  publishers: PublisherRegistration[]
  mlcRegistered: boolean
  mlcWorkId?: string
  registeredAt?: string
}

export interface SoundRecordingRegistration {
  isrc: string | null
  label: string | null
  distributor: string | null
  soundExchangeRegistered: boolean
  soundExchangeRecordingId?: string
}

export interface MechanicalRegistration {
  // Whether MLC has the work registered for mechanical collections
  mlcRegistered: boolean
  mlcWorkId?: string
  harryFoxAdministered: boolean
}

export interface RoyaltyRate {
  // Per-stream rates in USD
  mechanicalPerStream: number    // composition mechanical (MLC statutory)
  performancePerStream: number   // composition performance (PRO)
  masterPerStream: number        // sound recording (label share)
  soundExchangePerStream: number // sound recording non-interactive (SoundExchange)
}

export interface RoyaltyEstimate {
  windowDays: number
  totalStreams: number
  rates: RoyaltyRate
  // Estimated USD earnings per category
  estimatedMechanical: number
  estimatedPerformance: number
  estimatedMasterRoyalty: number
  estimatedTotal: number
  // Who is likely collecting
  mechanicalCollector: string | null  // 'MLC' | publisher name
  performanceCollector: string | null // PRO name
  masterCollector: string | null      // label name
}

export type RightsGapType =
  | 'NO_PRO_REGISTRATION'
  | 'NO_MLC_REGISTRATION'
  | 'NO_LABEL_DATA'
  | 'UNSIGNED_WITH_STREAMS'
  | 'MISSING_ISWC'
  | 'MISSING_ISRC'
  | 'NO_PUBLISHER'
  | 'UNCLAIMED_MECHANICAL'

export interface RightsGap {
  type: RightsGapType
  severity: 'critical' | 'warning' | 'info'
  description: string
}

export interface RightsProfile {
  trackId: number
  trackTitle: string
  isrc: string | null
  iswc: string | null

  soundRecording: SoundRecordingRegistration
  composition: WorkRegistration
  mechanical: MechanicalRegistration
  royaltyEstimate: RoyaltyEstimate | null

  gaps: RightsGap[]
  rightsComplexityScore: number // 0-1, higher = more complex / more parties

  // Metadata
  fetchedAt: string
  dataSources: string[]
}

export interface SongwriterRightsProfile {
  songwriterId: number
  songwriterName: string
  ipi: string | null
  proSociety: ProSociety | null
  publisherName: string | null
  isSigned: boolean
  signedLabel: string | null
  tracksWithRights: number
  estimatedAnnualMechanical: number
  estimatedAnnualPerformance: number
  gaps: RightsGap[]
  fetchedAt: string
}
