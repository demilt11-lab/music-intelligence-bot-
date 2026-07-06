/**
 * GET /api/internal/ml/status
 *
 * Returns the current state of all stored ML models (accuracy, samples, age).
 * Protected by INTERNAL_ADMIN_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { db } from '@/lib/db';
import { listModelVersions } from '@/lib/ml/versioning';

export async function GET(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const models = await db.mlModel.findMany({
    select: {
      modelType: true,
      version: true,
      accuracy: true,
      nSamples: true,
      trainedAt: true,
      createdAt: true,
    },
    orderBy: { modelType: 'asc' },
  });

  const now = Date.now();
  const enriched = await Promise.all(
    models.map(async (m) => ({
      ...m,
      ageHours: Math.round((now - m.trainedAt.getTime()) / 3_600_000),
      needsRetraining: now - m.trainedAt.getTime() > 24 * 3_600_000,
      // Recent version history so an operator can pick a rollback target.
      versions: await listModelVersions(m.modelType, 10),
    })),
  );

  return NextResponse.json({ obj: enriched });
}
