import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = Number(id)

  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }

  try {
    const track = await db.track.findUnique({
      where: { id: trackId },
      include: {
        trackArtists: {
          include: {
            artist: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        statisticsLatest: true,
        trackAlbums: {
          include: {
            album: {
              select: {
                id: true,
                name: true,
                releaseDate: true,
              },
            },
          },
          take: 1,
        },
      },
    })

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    const primaryAlbum = track.trackAlbums?.[0]?.album ?? null
    const stats = track.statisticsLatest

    return NextResponse.json({
      obj: {
        id: track.id,
        name: track.title,
        isrc: track.isrc ?? null,
        releaseDate: primaryAlbum?.releaseDate ?? track.releaseDate ?? null,
        albumLabel: null,
        trackTier: null,
        artists: track.trackArtists.map((ta: any) => ({
          id: ta.artist.id,
          name: ta.artist.name,
        })),
        statistics: stats
          ? {
              spotifyPopularity: track.popularity ?? null,
              spotifyStreams: stats.totalStreams?.toString() ?? null,
              tiktokVideoCount: stats.tiktokVideoCount?.toString() ?? null,
              youtubeViews: stats.youtubeViews?.toString() ?? null,
            }
          : {
              spotifyPopularity: track.popularity ?? null,
              spotifyStreams: null,
              tiktokVideoCount: null,
              youtubeViews: null,
            },
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
