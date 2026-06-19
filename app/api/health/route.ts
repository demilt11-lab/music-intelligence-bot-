// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // lightweight DB check
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok' },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { status: 'degraded' },
      { status: 503 },
    );
  }
}
