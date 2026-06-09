import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/platform/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// This cron fires the internal ETL endpoint (runs in a separate process/service)
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const internalBase = process.env.INTERNAL_API_BASE_URL;
  if (!internalBase) {
    return NextResponse.json({ error: 'INTERNAL_API_BASE_URL not set' }, { status: 500 });
  }

  try {
    const res = await fetch(`${internalBase}/api/internal/etl/artist-trajectory`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.INTERNAL_CRON_SECRET ?? '' },
    });
    const body = await res.json();
    return NextResponse.json({ ok: res.ok, status: res.status, body });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
