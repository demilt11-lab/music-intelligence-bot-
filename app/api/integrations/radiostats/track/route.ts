// app/api/integrations/radiostats/track/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRadiostatsTrackStats } from '@/lib/radiostats/tracks';
import { db } from '@/lib/db'; // Prisma client, already in repo.[page:3]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trackId, isrc, spotifyTrackId, from, to } = body;

    if (!trackId && !isrc && !spotifyTrackId) {
      return NextResponse.json(
        { error: 'trackId, isrc, or spotifyTrackId is required' },
        { status: 400 },
      );
    }

    // If only trackId provided, resolve ISRC / Spotify from DB
    let resolvedIsrc = isrc;
    let resolvedSpotifyId = spotifyTrackId;

    if (trackId && (!isrc || !spotifyTrackId)) {
      const track = await db.tracks.findUnique({
        where: { id: trackId },
        include: {
          externalIds: true, // assuming an external_ids relation from schema.[page:3]
        },
      });

      if (!track) {
        return NextResponse.json(
          { error: 'Track not found' },
          { status: 404 },
        );
      }

      resolvedIsrc = resolvedIsrc ?? track.isrc ?? undefined;
      if (!resolvedSpotifyId && track.externalIds) {
        const spotify = track.externalIds.find(
          (e: any) => e.platform === 'spotify' && e.type === 'track',
        );
        if (spotify) resolvedSpotifyId = spotify.externalId;
      }
    }

    if (!resolvedIsrc && !resolvedSpotifyId) {
      return NextResponse.json(
        { error: 'No ISRC or Spotify track ID available for this track' },
        { status: 400 },
      );
    }

    const stats = await getRadiostatsTrackStats({
      isrc: resolvedIsrc,
      spotify_id: resolvedSpotifyId,
      from,
      to,
    });

    // Optional: log raw payload into a table for traceability
    // Replace radiostats_track_logs with actual table if/when you add it
    // await db.radiostats_track_logs.create({
    //   data: {
    //     trackId,
    //     isrc: resolvedIsrc,
    //     spotifyTrackId: resolvedSpotifyId,
    //     payload: stats,
    //   },
    // });

    return NextResponse.json({ obj: stats }, { status: 200 });
  } catch (err: any) {
    console.error('Radiostats track integration error', err);
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status },
    );
  }
}
