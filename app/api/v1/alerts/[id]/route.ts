import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';

const endpoint = '/api/v1/alerts/[id]';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'alerts:write');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:alerts`, 50);

    const id = Number(params.id);
    const rule = await db.alertRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const updated = await db.alertRule.update({
      where: { id, tenantId: ctx.tenantId },
      data: { isActive: body.isActive ?? rule.isActive },
    });

    await logRequest(ctx, endpoint, 'PATCH', 200, startedAt);
    return NextResponse.json({ obj: updated });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'PATCH', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'alerts:write');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:alerts`, 50);

    const id = Number(params.id);
    const { count } = await db.alertRule.deleteMany({ where: { id, tenantId: ctx.tenantId } });
    if (count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await logRequest(ctx, endpoint, 'DELETE', 204, startedAt);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'DELETE', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
