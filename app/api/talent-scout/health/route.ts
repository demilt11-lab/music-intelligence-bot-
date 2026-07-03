// app/api/talent-scout/health/route.ts
// Diagnostic route for the talent-scout data pipeline. Internal-only: it
// leaks credential-configuration state and makes a real outbound Spotify API
// call on every hit, so it must not be reachable by the public internet.

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/platform/internal-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

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

  // 2. Spotify credentials present (boolean only — no lengths, even behind auth)
  results.spotifyEnv = {
    clientIdPresent: !!process.env.SPOTIFY_CLIENT_ID,
    clientSecretPresent: !!process.env.SPOTIFY_CLIENT_SECRET,
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
