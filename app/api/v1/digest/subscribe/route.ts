import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';

const endpoint = '/api/v1/digest/subscribe';

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'digest:write');

    const body = await req.json();
    const { email, webhookUrl, frequency = 'daily' } = body;

    if (!email && !webhookUrl) {
      return NextResponse.json({ error: 'Provide at least one of: email, webhookUrl' }, { status: 400 });
    }
    if (!['daily', 'weekly'].includes(frequency)) {
      return NextResponse.json({ error: 'frequency must be daily or weekly' }, { status: 400 });
    }

    const sub = await db.digestSubscription.create({
      data: { tenantId: ctx.tenantId, email, webhookUrl, frequency, isActive: true },
    });

    await logRequest(ctx, endpoint, 'POST', 201, startedAt);
    return NextResponse.json({ obj: sub }, { status: 201 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'digest:read');

    const subs = await db.digestSubscription.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj: subs });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
