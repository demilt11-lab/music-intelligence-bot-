import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { successResponse } from '@/lib/shared/response'

type RouteParams = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, props: RouteParams) {
  const params = await props.params;
  const id = Number(params.id)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json(
      { error: 'Invalid track id' },
      { status: 400 }
    )
  }

  try {
    const track = await db.track.findUnique({
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
        // `Track` has no tier concept in the schema; expose null so the UI
        // renders an em-dash rather than crashing on an undefined field.
        trackTier: null,
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

    // successResponse serialises BigInt fields (totalStreams, tiktokCreations,
    // youtubeViews) to strings so JSON.stringify does not throw.
    return successResponse(payload, 200)
  } catch (err) {
    console.error('GET /api/tracks/[id] error', err)
    return NextResponse.json(
      { error: 'Internal error loading track' },
      { status: 500 }
    )
  }
}
