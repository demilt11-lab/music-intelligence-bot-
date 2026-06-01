import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';

const endpoint = '/api/v1/watchlist/[id]';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:write');

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const item = await db.watchlistItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.watchlistItem.delete({ where: { id } });

    await logRequest(ctx, endpoint, 'DELETE', 204, startedAt);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'DELETE', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
