import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  const { artistId: artistIdParam } = await params
  const artistId = Number(artistIdParam)

  if (!Number.isFinite(artistId)) {
    return NextResponse.json({ error: 'Invalid artistId' }, { status: 400 })
  }

  try {
    const [artist, snapshot, history, releases] = await Promise.all([
      db.artist.findUnique({
        where: { id: artistId },
      }),

      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: 'desc' },
      }),

      db.artistDailyStats.findMany({
        where: { artistId },
        orderBy: { date: 'desc' },
        take: 120,
      }),

      db.track.findMany({
        where: {
          trackArtists: {
            some: {
              artistId,
            },
          },
        },
        include: {
          trackAlbums: {
            include: {
              album: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            take: 1,
          },
          statisticsLatest: {
            select: {
              totalStreams: true,
            },
          },
        },
        take: 100,
      }),
    ])

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    return NextResponse.json({
      obj: {
        artist: {
          id: artist.id.toString(),
          name: artist.name,
          code2: (artist as any).code2 ?? null,
        },
        snapshot: snapshot
          ? {
              ...snapshot,
              id: Number(snapshot.id),
              artistId: Number(snapshot.artistId),
            }
          : null,
        history: history.map((h) => ({
          ...h,
          artistId: Number(h.artistId),
          totalStreams: (h as any).totalStreams?.toString() ?? '0',
          playlistReach: (h as any).playlistReach?.toString() ?? null,
        })),
        releases: releases.map((r) => ({
          id: r.id.toString(),
          name: r.title,
          isrc: r.isrc ?? null,
          albums: r.trackAlbums.map((ta: any) => ({
            id: ta.album.id,
            name: ta.album.name,
          })),
          statistics: r.statisticsLatest
            ? {
                spotifyStreams: (r.statisticsLatest as any).totalStreams?.toString() ?? null,
              }
            : null,
        })),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load artist trajectory',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
