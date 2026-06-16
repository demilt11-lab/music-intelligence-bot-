// app/api/talent-scout/genres/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ScoutGenres } from '@/lib/engine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const usCode2 = searchParams.get('usCode2') ?? 'US';
    const limit = Number(searchParams.get('limit') ?? '5');

    const [signals, coverage] = await Promise.all([
      ScoutGenres.computeGenreBreakouts({ date, usCode2 }),
      ScoutGenres.getGenreSourceCoverage(date),
    ]);

    return NextResponse.json({
      obj: signals.slice(0, limit),
      meta: {
        date: coverage.date,
        usCode2,
        description:
          'NOV8TE proprietary genre breakout detector combining UGC, Spotify charts, and US radio.',
        sources: {
          ugc: coverage.ugc,
          spotifyCharts: coverage.spotifyCharts,
          usRadio: coverage.usRadio,
        },
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
