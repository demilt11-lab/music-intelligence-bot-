// app/api/cron/compute-writer-producer-scores/route.ts
// Vercel Cron: daily at 05:30 UTC — after streaming stats are ingested.
import { NextRequest, NextResponse } from 'next/server';
import { upsertRisingScores } from '@/lib/writersProducers/risingScorer';
import { verifyCronSecret } from '@/lib/platform/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);

  const written = await upsertRisingScores(date);

  return NextResponse.json({ ok: true, date: date.toISOString().split('T')[0], written });
}
