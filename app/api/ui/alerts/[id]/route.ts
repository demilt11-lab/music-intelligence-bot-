// app/api/ui/alerts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard';
import { enforceKeyedRateLimit } from '@/lib/platform/rate-limit';

export const dynamic = 'force-dynamic';

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if ((err as { status?: number })?.status) {
    const status = (err as { status: number }).status;
    return NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status });
  }
  console.error(`[ui/alerts/:id] ${fallback}:`, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);
    await enforceKeyedRateLimit(`tenant:${user.tenantId}`, 'ui:alerts:write', 60);

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid alert rule id' }, { status: 400 });
    }

    const rule = await db.alertRule.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { isActive?: unknown };
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : rule.isActive;

    const updated = await db.alertRule.update({ where: { id }, data: { isActive } });
    return NextResponse.json({ obj: updated });
  } catch (err) {
    return errorResponse(err, 'Failed to update alert rule');
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);
    await enforceKeyedRateLimit(`tenant:${user.tenantId}`, 'ui:alerts:write', 60);

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid alert rule id' }, { status: 400 });
    }

    const rule = await db.alertRule.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    await db.alertRule.delete({ where: { id } });
    return NextResponse.json({ obj: { removed: true } });
  } catch (err) {
    return errorResponse(err, 'Failed to delete alert rule');
  }
}
