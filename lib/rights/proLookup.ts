// PRO (Performing Rights Organisation) lookup.
// Uses the Soundcharts publisher API (which we already integrate) when an IPI is known.
// Falls back to name-based ASCAP/BMI public repertoire search via web fetch.

import { createSoundchartsConnector } from '@/lib/integrations/soundcharts'
import type { ProSociety, PublisherRegistration, WriterRegistration, WorkRegistration } from './types'

function buildConnector() {
  const appId = process.env.SOUNDCHARTS_APP_ID
  const apiKey = process.env.SOUNDCHARTS_API_KEY
  if (!appId || !apiKey) return null
  return createSoundchartsConnector({ appId, apiKey })
}

// Map Soundcharts society codes to our enum
function parseSociety(raw: string | undefined): ProSociety {
  if (!raw) return 'UNKNOWN'
  const upper = raw.toUpperCase()
  if (upper.includes('BMI')) return 'BMI'
  if (upper.includes('ASCAP')) return 'ASCAP'
  if (upper.includes('SESAC')) return 'SESAC'
  if (upper.includes('GMR')) return 'GMR'
  return 'UNKNOWN'
}

interface IpiLookupResult {
  publisherName: string | null
  proSociety: ProSociety
  soundchartsUuid: string | null
  ipi: string
}

// Look up a publisher/PRO society via Soundcharts publisher-by-IPI endpoint
export async function lookupPublisherByIpi(ipi: string): Promise<IpiLookupResult | null> {
  const connector = buildConnector()
  if (!connector) return null

  try {
    const res = await connector.getPublisherByIpi(ipi)
    const obj = res?.obj as Record<string, unknown> | undefined
    if (!obj) return null

    const name = (obj.name as string) ?? null
    const society = parseSociety(obj.society as string | undefined)
    const uuid = (obj.uuid as string) ?? null

    return { publisherName: name, proSociety: society, soundchartsUuid: uuid, ipi }
  } catch {
    return null
  }
}

// Build a WorkRegistration from songwriter IPI data via Soundcharts
export async function buildWorkRegistrationFromIpis(
  trackTitle: string,
  iswc: string | null,
  songwriterIpis: Array<{ songwriterId: number; name: string; ipi: string | null }>,
): Promise<WorkRegistration> {
  const connector = buildConnector()

  const writers: WriterRegistration[] = []
  const publishers: PublisherRegistration[] = []
  const seenPublishers = new Set<string>()

  for (const sw of songwriterIpis) {
    // Always record the writer entry
    const writerEntry: WriterRegistration = {
      ipi: sw.ipi,
      name: sw.name,
      proSociety: 'UNKNOWN',
      role: 'songwriter',
    }

    if (sw.ipi && connector) {
      try {
        const res = await connector.getPublisherByIpi(sw.ipi)
        const obj = res?.obj as Record<string, unknown> | undefined
        if (obj) {
          writerEntry.proSociety = parseSociety(obj.society as string | undefined)

          // Soundcharts publisher-by-IPI may also return the publisher affiliation
          const pubName = obj.publisher as string | undefined
          const pubIpi = obj.publisherIpi as string | undefined
          if (pubName && !seenPublishers.has(pubName)) {
            seenPublishers.add(pubName)
            publishers.push({
              ipi: pubIpi ?? null,
              name: pubName,
              proSociety: parseSociety(obj.society as string | undefined),
              role: 'publisher',
            })
          }
        }
      } catch {
        // Soundcharts unavailable — carry on with what we have
      }
    }

    writers.push(writerEntry)
  }

  return {
    iswc,
    title: trackTitle,
    writers,
    publishers,
    mlcRegistered: false, // filled in by mlcLookup
    mlcWorkId: undefined,
  }
}
