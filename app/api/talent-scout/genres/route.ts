// app/api/talent-scout/genres/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { computeGenreBreakouts } from '@/lib/talentScout/genres';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const usCode2 = searchParams.get('usCode2') ?? 'US';
    const limit = Number(searchParams.get('limit') ?? '5');

    const signals = await computeGenreBreakouts({ date, usCode2 });

    return NextResponse.json({
      obj: signals.slice(0, limit),
      meta: {
        date,
        usCode2,
        description:
          'Next-genre-to-break detector combining UGC, international playlists, and US radio.',
      },
    });
  } catch (err: any) {
    console.error('[talent-scout-genres]', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
