// app/api/talent-scout/health/route.ts
// Hit /api/talent-scout/health to diagnose data pipeline issues

import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. DB connectivity
  try {
    const { db } = await import('@/lib/db');
    results.db = {
      tracks: await db.track.count(),
      chartRows: await db.chartRow.count(),
      talentScoutScores: await db.talentScoutScore.count(),
      ugcMetrics: await db.ugcTrackMetrics.count(),
    };
  } catch (err: any) {
    results.db = { error: err.message };
  }

  // 2. Spotify credentials present
  results.spotifyEnv = {
    clientIdPresent: !!process.env.SPOTIFY_CLIENT_ID,
    clientIdLength: process.env.SPOTIFY_CLIENT_ID?.length ?? 0,
    clientSecretPresent: !!process.env.SPOTIFY_CLIENT_SECRET,
    clientSecretLength: process.env.SPOTIFY_CLIENT_SECRET?.length ?? 0,
  };

  // 3. Spotify token fetch
  try {
    const { spotifyGet } = await import('@/lib/spotify/client');
    const result = await spotifyGet<{ tracks: { items: unknown[] } }>('/search', {
      q: 'genre:pop',
      type: 'track',
      limit: 3,
    });
    results.spotifySearch = { ok: true, itemCount: result.tracks.items.length };
  } catch (err: any) {
    results.spotifySearch = { ok: false, error: err.message, status: err.status };
  }

  return NextResponse.json(results, { status: 200 });
}
