import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Cache, TTL } from '@/lib/cache'

export const dynamic = 'force-dynamic'

type ExplanationFactor = {
  factor: string
  value: number | null
  display: string
  direction: 'positive' | 'negative' | 'neutral'
  note: string
}

function pct(v: number | null | undefined): string {
  if (v == null) return 'no data'
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

/**
 * Deterministic, rule-traceable explanation of why the artist carries its
 * current status. Every factor maps 1:1 to an input of the classification —
 * nothing here is generated or inferred beyond the stored snapshot.
 */
function buildExplanation(snapshot: {
  status: string
  streams28dDelta: number
  playlistsDelta28d: number | null
  followersDelta28d: number | null
  streams7dDelta: number
  maxTrackProbViral: number | null
  spotifyBreakProb: number | null
}): ExplanationFactor[] {
  const factors: ExplanationFactor[] = [
    {
      factor: 'Stream momentum (28d vs prior 28d)',
      value: snapshot.streams28dDelta,
      display: pct(snapshot.streams28dDelta),
      direction:
        snapshot.streams28dDelta > 0.2
          ? 'positive'
          : snapshot.streams28dDelta < -0.2
            ? 'negative'
            : 'neutral',
      note:
        'Primary driver: >+100% combined with playlist and follower growth flags ABOUT TO BREAK; >+20% flags GROWING.',
    },
    {
      factor: 'Short-term acceleration (7d vs prior 7d)',
      value: snapshot.streams7dDelta,
      display: pct(snapshot.streams7dDelta),
      direction:
        snapshot.streams7dDelta > 0
          ? 'positive'
          : snapshot.streams7dDelta < 0
            ? 'negative'
            : 'neutral',
      note: 'Context signal — shows whether momentum is building or fading inside the month.',
    },
    {
      factor: 'Playlist lift (28d)',
      value: snapshot.playlistsDelta28d,
      display: pct(snapshot.playlistsDelta28d),
      direction:
        (snapshot.playlistsDelta28d ?? 0) > 0
          ? 'positive'
          : (snapshot.playlistsDelta28d ?? 0) < 0
            ? 'negative'
            : 'neutral',
      note: 'Breakout flag requires >+50% playlist growth alongside stream momentum.',
    },
    {
      factor: 'Audience growth (followers, 28d)',
      value: snapshot.followersDelta28d,
      display: pct(snapshot.followersDelta28d),
      direction:
        (snapshot.followersDelta28d ?? 0) > 0
          ? 'positive'
          : (snapshot.followersDelta28d ?? 0) < 0
            ? 'negative'
            : 'neutral',
      note: 'Breakout flag requires >+20% follower growth — converts consumption into a durable audience.',
    },
  ]

  if (snapshot.maxTrackProbViral != null) {
    factors.push({
      factor: 'Strongest track viral probability (ML)',
      value: snapshot.maxTrackProbViral,
      display: `${(snapshot.maxTrackProbViral * 100).toFixed(0)}%`,
      direction: snapshot.maxTrackProbViral > 0.5 ? 'positive' : 'neutral',
      note: 'Highest viral-class probability among the artist’s recent releases (trend model).',
    })
  }

  if (snapshot.spotifyBreakProb != null) {
    factors.push({
      factor: 'Model break probability',
      value: snapshot.spotifyBreakProb,
      display: `${(snapshot.spotifyBreakProb * 100).toFixed(0)}%`,
      direction: snapshot.spotifyBreakProb > 0.5 ? 'positive' : 'neutral',
      note: 'Calibrated model output (see model accuracy below for how reliable this has been).',
    })
  }

  return factors
}

export async function GET(_req: NextRequest, props: { params: Promise<{ artistId: string }> }) {
  const params = await props.params;
  const artistId = Number(params.artistId)

  if (!Number.isInteger(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Invalid artistId' }, { status: 400 })
  }

  const cacheKey = `artist:trajectory:${artistId}`
  const cached = Cache.get<object>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'x-cache': 'hit' } })
  }

  try {
    const [artist, snapshot, history, releases, accuracy] = await Promise.all([
      db.artist.findUnique({ where: { id: artistId } }),
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
        where: { trackArtists: { some: { artistId } } },
        include: {
          trackAlbums: {
            include: { album: { select: { id: true, title: true } } },
            take: 1,
          },
          statisticsLatest: { select: { totalStreams: true } },
        },
        orderBy: { releaseDate: 'desc' },
        take: 100,
      }),
      db.modelAccuracyReport.findFirst({
        orderBy: { evaluationDate: 'desc' },
      }),
    ])

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    const payload = {
      obj: {
        artist: {
          id: artist.id.toString(),
          name: artist.name,
          code2: artist.country ?? null,
        },
        snapshot: snapshot
          ? {
              id: snapshot.id,
              artistId: snapshot.artistId,
              date: snapshot.date,
              streams7d: Number(snapshot.streams7d),
              streams28d: Number(snapshot.streams28d),
              streams90d: Number(snapshot.streams90d),
              streams7dDelta: snapshot.streams7dDelta,
              streams28dDelta: snapshot.streams28dDelta,
              streams90dDelta: snapshot.streams90dDelta,
              followersDelta28d: snapshot.followersDelta28d,
              playlistsDelta28d: snapshot.playlistsDelta28d,
              primaryGenre: snapshot.primaryGenre,
              primaryCode2: snapshot.primaryCode2,
              status: snapshot.status,
              statusScore: snapshot.statusScore,
              breakProbability: snapshot.breakProbability,
              breakProbabilitySource:
                snapshot.spotifyBreakProb != null ? 'model' : 'heuristic',
              modelBreakProbability: snapshot.spotifyBreakProb,
              maxTrackProbViral: snapshot.maxTrackProbViral,
            }
          : null,
        explanation: snapshot ? buildExplanation(snapshot) : [],
        modelAccuracy: accuracy
          ? {
              modelName: accuracy.modelName,
              evaluationDate: accuracy.evaluationDate,
              windowDays: accuracy.windowDays,
              totalPredictions: accuracy.totalPredictions,
              accuracy: accuracy.accuracy,
              precision: accuracy.precision,
              recall: accuracy.recall,
            }
          : null,
        history: history.map((h) => ({
          artistId: Number(h.artistId),
          date: h.date,
          totalStreams: h.totalStreams.toString(),
          playlistCount: h.playlistCount,
          editorialPlaylistCount: h.editorialPlaylistCount,
          indiePlaylistCount: h.indiePlaylistCount,
          playlistReach: h.playlistReach?.toString() ?? null,
          genres: h.genres,
          primaryCode2: h.primaryCode2,
        })),
        releases: releases.map((r) => ({
          id: r.id.toString(),
          name: r.title,
          isrc: r.isrc ?? null,
          albums: r.trackAlbums.map((ta) => ({
            id: ta.album.id,
            name: ta.album.title,
          })),
          statistics: r.statisticsLatest
            ? {
                spotifyStreams:
                  r.statisticsLatest.totalStreams?.toString() ?? null,
              }
            : null,
        })),
      },
    }

    Cache.set(cacheKey, payload, TTL.SHORT)
    return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } })
  } catch (error) {
    console.error('[api/artists/:id/trajectory]', error)
    return NextResponse.json(
      { error: 'Failed to load artist trajectory' },
      { status: 500 }
    )
  }
}
