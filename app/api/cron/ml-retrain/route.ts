/**
 * GET /api/cron/ml-retrain
 *
 * Vercel Cron job — retrains both ML models nightly after ingest completes.
 * Schedule is set in vercel.json.
 *
 * Authentication: CRON_SECRET bearer token (same pattern as other cron routes).
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { trainArtistTrajectoryModel } from '@/lib/ml/models/artist-trajectory';
import { trainTrackViralModel, writeAllTrackPredictions } from '@/lib/ml/models/track-viral';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const results: Record<string, unknown> = {};

  try {
    results['artist-trajectory'] = await trainArtistTrajectoryModel();
  } catch (err: any) {
    logger.error('[cron:ml-retrain] artist-trajectory failed:', err?.message);
    results['artist-trajectory'] = { error: err?.message };
  }

  try {
    results['track-viral'] = await trainTrackViralModel();
  } catch (err: any) {
    logger.error('[cron:ml-retrain] track-viral failed:', err?.message);
    results['track-viral'] = { error: err?.message };
  }

  // After training, write ML predictions for all labelled tracks
  try {
    const predictions = await writeAllTrackPredictions();
    results['track-predictions'] = predictions;
  } catch (err: any) {
    logger.error('[cron:ml-retrain] writeAllTrackPredictions failed:', err?.message);
    results['track-predictions'] = { error: err?.message };
  }

  logger.info(`[cron:ml-retrain] done in ${Date.now() - started}ms`, results);
  return NextResponse.json({ ok: true, durationMs: Date.now() - started, results });
}
