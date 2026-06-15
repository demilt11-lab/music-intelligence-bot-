// MLC (Mechanical Licensing Collective) Work Registry lookup.
// MLC collects and distributes mechanical royalties for on-demand streaming in the US.
// Their public Work Registry is searchable by ISRC.
// API base: https://api.themlc.com (public, no auth required for registry search)

import type { MechanicalRegistration } from './types'
import { cacheIswc } from './songCodes'

const MLC_API = 'https://api.themlc.com/v1'
const TIMEOUT_MS = 8_000

interface MlcWork {
  id: string
  iswc?: string
  title?: string
  isrcs?: string[]
}

interface MlcSearchResponse {
  content?: MlcWork[]
  totalElements?: number
}

async function fetchWithTimeout(url: string, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MusicIntelligenceBot/1.0' },
    })
  } finally {
    clearTimeout(timer)
  }
}

// Search MLC Work Registry by ISRC — returns the first matching work
async function searchByIsrc(isrc: string): Promise<MlcWork | null> {
  try {
    const url = `${MLC_API}/works?isrc=${encodeURIComponent(isrc)}&page=0&size=1`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data: MlcSearchResponse = await res.json()
    return data?.content?.[0] ?? null
  } catch {
    return null
  }
}

// Search MLC Work Registry by ISWC
async function searchByIswc(iswc: string): Promise<MlcWork | null> {
  try {
    const url = `${MLC_API}/works?iswc=${encodeURIComponent(iswc)}&page=0&size=1`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data: MlcSearchResponse = await res.json()
    return data?.content?.[0] ?? null
  } catch {
    return null
  }
}

export async function getMechanicalRegistration(
  trackId: number,
  isrc: string | null,
  iswc: string | null,
): Promise<MechanicalRegistration & { discoveredIswc?: string }> {
  let work: MlcWork | null = null

  // Try ISRC first (more commonly available)
  if (isrc) {
    work = await searchByIsrc(isrc)
  }

  // Fall back to ISWC if available
  if (!work && iswc) {
    work = await searchByIswc(iswc)
  }

  if (!work) {
    return {
      mlcRegistered: false,
      harryFoxAdministered: false,
    }
  }

  // If we discovered an ISWC that we didn't have, persist it
  const discoveredIswc = work.iswc ?? undefined
  if (discoveredIswc && !iswc) {
    await cacheIswc(trackId, discoveredIswc)
  }

  return {
    mlcRegistered: true,
    mlcWorkId: work.id,
    harryFoxAdministered: false, // Harry Fox is now administered through MLC
    discoveredIswc,
  }
}

// Estimate whether Harry Fox Agency covers this work.
// Post-2021, MLC handles statutory mechanical licensing; Harry Fox primarily
// handles direct licensing. If MLC-registered, HFA administration is largely superseded.
export function isHarryFoxAdministered(mlcRegistered: boolean, publisherCount: number): boolean {
  // If not MLC registered but has publishers, HFA may still be administering
  return !mlcRegistered && publisherCount > 0
}
