// app/api/talent-scout/daily/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTopTiktokBreakoutTracks,
  hydrateInternalStreaming,
  hydrateLuminateMetrics,
} from '@/lib/talentScout/sources';
import { rankTalentTracks } from '@/lib/talentScout/score';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined; // defaults to latest in DB
    const code2 = searchParams.get('code2') ?? 'GLOBAL';
    const limit = Number(searchParams.get('limit') ?? '50');

    let tracks = await fetchTopTiktokBreakoutTracks({ date, code2, limit });
    tracks = await hydrateInternalStreaming(tracks);
    tracks = await hydrateLuminateMetrics(tracks);

    const ranked = rankTalentTracks(tracks);

    return NextResponse.json({
      obj: ranked,
      meta: {
        date,
        code2,
        limit,
        description:
          'Daily talent-scouting list combining TikTok breakout, internal streaming, and Luminate metrics.',
      },
    });
  } catch (err: any) {
    console.error('[talent-scout-daily]', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
