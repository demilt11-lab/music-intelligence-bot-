import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { ScoutSources, ScoutScore } from '@/lib/engine';

const endpoint = '/api/v1/talent-scout';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'talent-scout:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:talent-scout`, 200);

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const code2 = searchParams.get('code2') ?? 'GLOBAL';
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
    const mode = (searchParams.get('mode') ?? 'ugc_early') as 'ugc_early' | 'general';

    if (!['ugc_early', 'general'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be ugc_early or general' },
        { status: 400 },
      );
    }

    let tracks = await ScoutSources.fetchTopTiktokBreakoutTracks({ date, code2, limit });
    tracks = await ScoutSources.hydrateInternalStreaming(tracks);
    tracks = await ScoutSources.hydrateLuminateMetrics(tracks);
    tracks = await ScoutSources.hydrateMlSignals(tracks, date);

    const ranked = ScoutScore.rankTalentTracks(tracks, mode);

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({
      obj: ranked,
      meta: { date, code2, limit, mode },
    }, { status: 200 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
