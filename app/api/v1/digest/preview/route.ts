import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';
import { assembleDigest } from '@/lib/digest/assembler';

const endpoint = '/api/v1/digest/preview';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'digest:read');

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const payload = await assembleDigest(ctx.tenantId, tenant.name, date);

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj: payload });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
