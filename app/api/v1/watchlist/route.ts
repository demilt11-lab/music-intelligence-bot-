import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';
import { ScoutSources } from '@/lib/engine';
import { emptyTrack } from '@/lib/talentScout/emptyTrack';

const endpoint = '/api/v1/watchlist';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:read');

    const items = await db.watchlistItem.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { addedAt: 'desc' },
    });

    type WItem = { id: number; entityType: string; entityId: number; addedAt: Date; notes: string | null };
    const trackIds = (items as WItem[])
      .filter((i) => i.entityType === 'track')
      .map((i) => i.entityId);

    const hydrated = new Map<number, { viralScore: number | null }>();
    if (trackIds.length) {
      const raw = trackIds.map(emptyTrack);
      const withMl = await ScoutSources.hydrateMlSignals(raw);
      for (const t of withMl) hydrated.set(t.trackId, { viralScore: t.viralScore });
    }

    const enriched = (items as WItem[]).map((item) => {
      const baseline = item.notes ? (JSON.parse(item.notes) as { baselineViralScore?: number | null }) : null;
      const live = item.entityType === 'track' ? hydrated.get(item.entityId) : null;
      const viralScoreDelta =
        live?.viralScore != null && baseline?.baselineViralScore != null
          ? live.viralScore - baseline.baselineViralScore
          : null;
      return {
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        addedAt: item.addedAt,
        viralScore: live?.viralScore ?? null,
        viralScoreDelta,
        trendLabel: null,
      };
    });

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj: enriched, meta: { count: enriched.length } });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:write');

    const body = await req.json() as { entityType?: string; entityId?: unknown };
    const { entityType, entityId } = body;

    if (!['track', 'artist'].includes(entityType ?? '') || !Number.isInteger(entityId)) {
      return NextResponse.json({ error: 'entityType must be track|artist, entityId must be an integer' }, { status: 400 });
    }

    let notes: string | null = null;
    if (entityType === 'track') {
      const [withMl] = await ScoutSources.hydrateMlSignals([emptyTrack(entityId as number)]);
      notes = JSON.stringify({ baselineViralScore: withMl?.viralScore ?? null, addedAt: new Date().toISOString() });
    }

    const item = await db.watchlistItem.upsert({
      where: { tenantId_entityType_entityId: { tenantId: ctx.tenantId, entityType: entityType!, entityId: entityId as number } },
      update: {},
      create: { tenantId: ctx.tenantId, entityType: entityType!, entityId: entityId as number, notes },
    });

    await logRequest(ctx, endpoint, 'POST', 201, startedAt);
    return NextResponse.json({ obj: item }, { status: 201 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
