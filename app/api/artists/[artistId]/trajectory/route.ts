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
        orderBy: { date: 'asc' },
        take: 120,
      }),

      db.track.findMany({
        where: {
          artists: {
            some: {
              artistId,
            },
          },
        },
        include: {
          albums: {
            select: {
              id: true,
              name: true,
            },
            take: 1,
          },
          statistics: {
            select: {
              spotifyStreams: true,
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
          code2: artist.code2 ?? null,
        },
        snapshot: snapshot
          ? {
              ...snapshot,
              artistId: Number(snapshot.artistId),
            }
          : null,
        history: history.map((h) => ({
          ...h,
          artistId: Number(h.artistId),
          totalStreams: h.totalStreams.toString(),
          totalListeners: h.totalListeners?.toString() ?? null,
          totalFollowers: h.totalFollowers?.toString() ?? null,
          playlistReach: h.playlistReach?.toString() ?? null,
        })),
        releases: releases.map((r) => ({
          id: r.id,
          name: r.name,
          isrc: r.isrc ?? null,
          albums: r.albums.map((a) => ({
            id: Number(a.id),
            name: a.name,
          })),
          statistics: r.statistics
            ? {
                spotifyStreams: r.statistics.spotifyStreams?.toString() ?? null,
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
