// app/api/artists/[artistId]/route.ts
//
// First-party artist summary for the web UI. Reads the DB directly —
// previously this proxied the key-authenticated v1 API through the app's
// own public URL, which broke whenever NEXT_PUBLIC_API_KEY/BASE_URL were
// unset and shipped a tenant key to the browser bundle.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, props: { params: Promise<{ artistId: string }> }) {
  const params = await props.params;
  const artistId = Number(params.artistId)
  if (!Number.isInteger(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Invalid artist id' }, { status: 400 })
  }

  try {
    const [artist, snapshot, externalIds] = await Promise.all([
      db.artist.findUnique({ where: { id: artistId } }),
      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: 'desc' },
      }),
      db.externalId.findMany({
        where: { entityType: 'artist', entityId: artistId },
      }),
    ])

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    const obj = {
      id: artist.id.toString(),
      name: artist.name,
      country: artist.country ?? null,
      externalIds: externalIds.reduce<Record<string, string[]>>((acc, e) => {
        if (!acc[e.platform]) acc[e.platform] = []
        acc[e.platform].push(e.externalId)
        return acc
      }, {}),
      trajectory: snapshot
        ? {
            status: snapshot.status,
            breakProbability: snapshot.breakProbability,
            statusScore: snapshot.statusScore,
            streams28dDelta: snapshot.streams28dDelta,
            playlistsDelta28d: snapshot.playlistsDelta28d,
            followersDelta28d: snapshot.followersDelta28d,
            primaryGenre: snapshot.primaryGenre,
            primaryCode2: snapshot.primaryCode2,
            date: snapshot.date,
          }
        : null,
    }

    return NextResponse.json({ obj })
  } catch (error) {
    logger.error('[api/artists/:id]', error)
    return NextResponse.json(
      { error: 'Failed to fetch artist detail' },
      { status: 500 }
    )
  }
}
