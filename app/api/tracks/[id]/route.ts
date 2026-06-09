import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const track = await db.track.findUnique({
      where: { id },
      include: {
        artists: {
          include: {
            artist: {
              select: {
                id: true,
                name: true,
                code2: true,
              },
            },
          },
        },
        statistics: true,
        albums: {
          select: {
            id: true,
            name: true,
            releaseDate: true,
            label: true,
          },
          take: 1,
        },
      },
    })

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const primaryAlbum = track.albums?.[0] ?? null

    return NextResponse.json({
      obj: {
        id: track.id,
        name: track.name,
        isrc: track.isrc ?? null,
        releaseDate: primaryAlbum?.releaseDate ?? null,
        albumLabel: primaryAlbum?.label ?? null,
        trackTier: (track as any).trackTier ?? null,
        artists: track.artists.map((ta: any) => ({
          id: ta.artist.id,
          name: ta.artist.name,
          code2: ta.artist.code2 ?? null,
        })),
        statistics: track.statistics
          ? {
              spotifyPopularity: track.statistics.spotifyPopularity ?? null,
              spotifyStreams: track.statistics.spotifyStreams?.toString() ?? null,
              tiktokVideoCount: track.statistics.tiktokVideoCount?.toString() ?? null,
              youtubeViews: track.statistics.youtubeViews?.toString() ?? null,
            }
          : null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load track detail',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
