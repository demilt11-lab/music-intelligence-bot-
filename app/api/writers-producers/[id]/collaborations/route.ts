// app/api/writers-producers/[id]/collaborations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { getWriterProducerCollaborations } from '@/lib/writersProducers/service';

const ENDPOINT = '/api/writers-producers/[id]/collaborations';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const { id: idStr } = await props.params;
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'songwriters:catalog:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:writers-producers:collaborations`);

    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const result = await getWriterProducerCollaborations({ id, limit, offset });

    const res = NextResponse.json({ obj: result }, { status: 200 });
    await logRequest(ctx, ENDPOINT, 'GET', 200, startedAt);
    return res;
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const status = e.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (e.message ?? 'Error');
    if (ctx) await logRequest(ctx, ENDPOINT, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
