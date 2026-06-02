// app/api/talent-scout/daily/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ScoutSources, ScoutScore } from '@/lib/engine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const code2 = searchParams.get('code2') ?? 'GLOBAL';
    const limit = Number(searchParams.get('limit') ?? '50');
    const mode = (searchParams.get('mode') ?? 'ugc_early') as 'ugc_early' | 'general';

    let tracks = await ScoutSources.fetchTopTiktokBreakoutTracks({ date, code2, limit });
    console.log(`[talent-scout-daily] fetchTopTiktokBreakoutTracks returned ${tracks.length} tracks for code2=${code2}`);
    tracks = await ScoutSources.hydrateInternalStreaming(tracks);
    tracks = await ScoutSources.hydrateLuminateMetrics(tracks);
    tracks = await ScoutSources.hydrateMlSignals(tracks, date);

    const ranked = ScoutScore.rankTalentTracks(tracks, mode);
    console.log(`[talent-scout-daily] ranked ${ranked.length} tracks`);

    return NextResponse.json({
      obj: ranked,
      meta: {
        date,
        code2,
        limit,
        mode,
        description:
          'NOV8TE proprietary daily UGC trend-spotting list combining internal ML, UGC, streaming, and Luminate metrics.',
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
