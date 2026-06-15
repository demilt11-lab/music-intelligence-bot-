// app/api/cron/compute-writer-producer-scores/route.ts
// Vercel Cron: daily at 05:30 UTC — after streaming stats are ingested.
import { NextRequest, NextResponse } from 'next/server';
import { upsertRisingScores } from '@/lib/writersProducers/risingScorer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);

  const written = await upsertRisingScores(date);

  return NextResponse.json({ ok: true, date: date.toISOString().split('T')[0], written });
}
