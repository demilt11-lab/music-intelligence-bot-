// app/api/internal/observability/route.ts
//
// The self-hosted APM/observability surface. GET returns production health —
// top errors (aggregated by fingerprint) and request-latency percentiles +
// error rate from RequestLog — without any external monitoring vendor.
// PATCH marks an error fingerprint resolved.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { latencyPercentiles } from '@/lib/platform/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const windowHours = Math.min(720, Math.max(1, Number(req.nextUrl.searchParams.get('windowHours') ?? 24)));
  const since = new Date(Date.now() - windowHours * 3600_000);

  const [topErrors, recentLogs, totalRequests, serverErrors] = await Promise.all([
    db.errorEvent.findMany({
      where: { resolvedAt: null },
      orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
      take: 25,
      select: {
        id: true, fingerprint: true, route: true, method: true, statusCode: true,
        errorName: true, message: true, count: true, firstSeenAt: true, lastSeenAt: true,
      },
    }),
    db.requestLog.findMany({ where: { createdAt: { gte: since } }, select: { endpoint: true, latencyMs: true, statusCode: true } }),
    db.requestLog.count({ where: { createdAt: { gte: since } } }),
    db.requestLog.count({ where: { createdAt: { gte: since }, statusCode: { gte: 500 } } }),
  ]);

  // Overall + per-endpoint latency percentiles.
  const overall = latencyPercentiles(recentLogs.map((l) => l.latencyMs));
  const byEndpointMap = new Map<string, number[]>();
  for (const l of recentLogs) {
    const arr = byEndpointMap.get(l.endpoint) ?? [];
    arr.push(l.latencyMs);
    byEndpointMap.set(l.endpoint, arr);
  }
  const byEndpoint = [...byEndpointMap.entries()]
    .map(([endpoint, samples]) => ({ endpoint, ...latencyPercentiles(samples) }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 20);

  return NextResponse.json(
    {
      obj: {
        windowHours,
        requests: {
          total: totalRequests,
          serverErrors,
          errorRate: totalRequests > 0 ? serverErrors / totalRequests : 0,
        },
        latencyMs: { overall, byEndpoint },
        errors: { openCount: topErrors.length, top: topErrors },
      },
    },
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { fingerprint?: string; resolved?: boolean } | null;
  if (!body?.fingerprint) {
    return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 });
  }
  const { count } = await db.errorEvent.updateMany({
    where: { fingerprint: body.fingerprint },
    data: { resolvedAt: body.resolved === false ? null : new Date() },
  });
  return NextResponse.json({ obj: { updated: count } }, { status: count > 0 ? 200 : 404 });
}
