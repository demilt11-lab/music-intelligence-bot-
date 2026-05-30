// app/api/talent-scout/daily/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTopUgcBreakoutTracks,
  hydrateInternalStreaming,
  hydrateLuminateMetrics,
} from '@/lib/talentScout/sources';
import { rankTalentTracks } from '@/lib/talentScout/score';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const code2 = searchParams.get('code2') ?? 'GLOBAL';
    const limit = Number(searchParams.get('limit') ?? '50');
    const mode = (searchParams.get('mode') ?? 'ugc_early') as 'ugc_early' | 'general';

    let tracks = await fetchTopUgcBreakoutTracks({ date, code2, limit });
    tracks = await hydrateInternalStreaming(tracks);
    tracks = await hydrateLuminateMetrics(tracks);

    const ranked = rankTalentTracks(tracks, mode);

    return NextResponse.json({
      obj: ranked,
      meta: {
        date,
        code2,
        limit,
        mode,
        description:
          'Daily UGC trend-spotting list combining TikTok, internal streaming, and Luminate metrics.',
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
