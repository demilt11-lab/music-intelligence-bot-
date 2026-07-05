// app/api/internal/ml/rollback/route.ts
//
// POST /api/internal/ml/rollback — revert an active ML model to a prior version
// in one step (the fast, tested rollback the readiness review required). Body:
//   { "modelType": "track-viral", "toVersion"?: 3 }
// Omitting `toVersion` reverts to the immediate predecessor.
import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { rollbackModel } from '@/lib/ml/versioning';
import { invalidateModelCache as invalidateTrackViral } from '@/lib/ml/models/track-viral';
import { invalidateModelCache as invalidateArtistTrajectory } from '@/lib/ml/models/artist-trajectory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KNOWN_TYPES = new Set(['track-viral', 'artist-trajectory']);

function invalidate(modelType: string) {
  if (modelType === 'track-viral') invalidateTrackViral();
  else if (modelType === 'artist-trajectory') invalidateArtistTrajectory();
}

export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { modelType?: string; toVersion?: number } | null;
  const modelType = body?.modelType;
  if (!modelType || !KNOWN_TYPES.has(modelType)) {
    return NextResponse.json({ error: `modelType must be one of ${[...KNOWN_TYPES].join(', ')}` }, { status: 400 });
  }

  try {
    const result = await rollbackModel(modelType, body?.toVersion);
    invalidate(modelType); // active weights change immediately, not after TTL
    return NextResponse.json({ obj: result }, { status: 200 });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    return NextResponse.json({ error: err?.message ?? 'rollback failed' }, { status });
  }
}
