export const dynamic = 'force-dynamic';
// app/api/internal/request-logs/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';

export async function GET(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const summary = await db.requestLog.groupBy({
    by: ['tenantId', 'endpoint'],
    _count: { id: true },
  });

  return NextResponse.json({ obj: summary }, { status: 200 });
}
