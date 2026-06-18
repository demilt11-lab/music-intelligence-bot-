import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/platform/cron-auth';
import { buildArtistTrajectorySnapshots } from '@/jobs/etl/artist_trajectory_snapshots';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Runs the artist trajectory ETL inline for today (or ?date=YYYY-MM-DD).
 * Snapshot writes are idempotent, so re-invocations are safe.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  try {
    const result = await buildArtistTrajectorySnapshots(date);
    return NextResponse.json({ ok: true, date, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'ETL failed';
    logger.error('[cron/etl-artist-trajectory]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
