/**
 * POST /api/internal/ml/train
 *
 * Triggers in-process ML training for one or both models.
 * Protected by INTERNAL_ADMIN_SECRET (same bearer token used for cron jobs).
 *
 * Body: { models?: ('artist-trajectory' | 'track-viral')[] }
 * Omitting `models` trains everything.
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { trainArtistTrajectoryModel } from '@/lib/ml/models/artist-trajectory';
import { trainTrackViralModel } from '@/lib/ml/models/track-viral';

export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  let modelsToTrain: string[] = ['artist-trajectory', 'track-viral'];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.models) && body.models.length) {
      modelsToTrain = body.models;
    }
  } catch {
    // missing or invalid body → train all
  }

  const results: Record<string, unknown> = {};

  if (modelsToTrain.includes('artist-trajectory')) {
    const started = Date.now();
    try {
      const r = await trainArtistTrajectoryModel();
      results['artist-trajectory'] = { ...r, durationMs: Date.now() - started };
    } catch (err: any) {
      results['artist-trajectory'] = { error: err?.message ?? String(err), durationMs: Date.now() - started };
    }
  }

  if (modelsToTrain.includes('track-viral')) {
    const started = Date.now();
    try {
      const r = await trainTrackViralModel();
      results['track-viral'] = { ...r, durationMs: Date.now() - started };
    } catch (err: any) {
      results['track-viral'] = { error: err?.message ?? String(err), durationMs: Date.now() - started };
    }
  }

  return NextResponse.json({ obj: results });
}
