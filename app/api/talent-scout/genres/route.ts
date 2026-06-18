// app/api/talent-scout/genres/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ScoutGenres } from '@/lib/engine';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const usCode2 = searchParams.get('usCode2') ?? 'US';
    const limit = Number(searchParams.get('limit') ?? '5');

    const signals = await ScoutGenres.computeGenreBreakouts({ date, usCode2 });

    return NextResponse.json({
      obj: signals.slice(0, limit),
      meta: {
        date,
        usCode2,
        description:
          'NOV8TE proprietary genre breakout detector combining UGC, playlists, and US radio.',
      },
    });
  } catch (err: any) {
    logger.error('[talent-scout-genres]', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
