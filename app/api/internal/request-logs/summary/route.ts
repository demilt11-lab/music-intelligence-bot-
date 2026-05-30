// app/api/internal/request-logs/summary/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const summary = await db.requestLog.groupBy({
    by: ['tenantId', 'endpoint'],
    _count: { id: true },
  });

  return NextResponse.json({ obj: summary }, { status: 200 });
}
