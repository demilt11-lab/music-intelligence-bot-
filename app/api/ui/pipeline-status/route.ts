// app/api/ui/pipeline-status/route.ts
//
// Operational status for the data pipeline: latest run per job, recent
// failures, and source freshness. Admin-only (BUG-007) — job statuses and
// raw error text are an internal engineering surface, not something every
// logged-in viewer/analyst should see.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guard';
import { getPipelineStatus } from '@/lib/jobs/pipelineStatus';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req);
    requireRole(user, 'ADMIN');

    const status = await getPipelineStatus();

    return NextResponse.json({ obj: status });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[ui/pipeline-status]', err);
    return NextResponse.json({ error: 'Failed to load pipeline status' }, { status: 500 });
  }
}
