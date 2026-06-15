// Retrieve ISRC / ISWC identifiers for a track from the DB and external sources.

import { db } from '@/lib/db'

export interface SongCodes {
  isrc: string | null
  iswc: string | null
  label: string | null
  songwriterIpis: Array<{ songwriterId: number; name: string; ipi: string | null }>
}

export async function getSongCodes(trackId: number): Promise<SongCodes> {
  const track = await db.track.findUnique({
    where: { id: trackId },
    select: {
      isrc: true,
      iswc: true,
      trackAlbums: {
        select: { album: { select: { label: true } } },
        orderBy: { trackNumber: 'asc' },
        take: 1,
      },
      songwriterTracks: {
        select: {
          songwriter: { select: { id: true, name: true, ipi: true } },
        },
      },
    },
  })

  if (!track) return { isrc: null, iswc: null, label: null, songwriterIpis: [] }

  return {
    isrc: track.isrc ?? null,
    iswc: track.iswc ?? null,
    label: track.trackAlbums[0]?.album?.label ?? null,
    songwriterIpis: track.songwriterTracks.map((st) => ({
      songwriterId: st.songwriter.id,
      name: st.songwriter.name,
      ipi: st.songwriter.ipi ?? null,
    })),
  }
}

// Attempt to persist a discovered ISWC back to the DB so future lookups are instant.
export async function cacheIswc(trackId: number, iswc: string): Promise<void> {
  try {
    await db.track.update({
      where: { id: trackId },
      data: { iswc },
    })
  } catch {
    // unique constraint violation means another worker already wrote it — safe to ignore
  }
}
