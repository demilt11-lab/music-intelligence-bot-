import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type RouteParams = {
  params: { trackId: string }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const id = Number(params.trackId)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json(
      { error: 'Invalid trackId' },
      { status: 400 }
    )
  }

  try {
    const track = await prisma.track.findUnique({
      where: { id },
      include: {
        trackArtists: {
          include: { artist: true },
          orderBy: { position: 'asc' },
        },
        trackAlbums: {
          include: { album: true },
          orderBy: { trackNumber: 'asc' },
        },
        statisticsLatest: true, // TrackStatisticsLatest
      },
    })

    if (!track) {
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    const primaryAlbum = track.trackAlbums[0]?.album ?? null

    const payload = {
      obj: {
        id: String(track.id),
        name: track.title, // UI expects `name`
        isrc: track.isrc,
        releaseDate: track.releaseDate?.toISOString() ?? null,
        albumLabel: primaryAlbum?.label ?? null,
        trackTier: track.tier ?? null,
        artists: track.trackArtists.map((ta) => ({
          id: String(ta.artist.id),
          name: ta.artist.name,
        })),
        statistics: track.statisticsLatest
          ? {
              spotifyPopularity: track.statisticsLatest.spotifyPopularity,
              spotifyStreams: track.statisticsLatest.totalStreams,
              tiktokVideoCount: track.statisticsLatest.tiktokCreations,
              youtubeViews: track.statisticsLatest.youtubeViews,
            }
          : null,
      },
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (err) {
    console.error('GET /api/tracks/[trackId] error', err)
    return NextResponse.json(
      { error: 'Internal error loading track' },
      { status: 500 }
    )
  }
}
