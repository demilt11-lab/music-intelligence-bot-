import { NextRequest } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { ScoutSources } from '@/lib/engine';
import { toCsvResponse } from '@/lib/export/csv';
import type { TalentScoutTrack } from '@/lib/talentScout/score';

const endpoint = '/api/v1/talent-scout/export';

const CSV_COLUMNS = [
  'track', 'artists', 'code2',
  'viralScore', 'rightsComplexity',
  'spotifyStreams', 'tiktokViews', 'tiktokVelocity',
  'luminateStreams', 'pitchStatus',
];

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'talent-scout:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:talent-scout:export`, 10);

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const code2 = searchParams.get('code2') ?? 'GLOBAL';
    const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 200);

    const ranked = await ScoutSources.fetchTopTiktokBreakoutTracks({ date, code2, limit });

    const rows = (ranked as TalentScoutTrack[]).map((t) => ({
      track: t.name,
      artists: t.artists.join('; '),
      code2: t.code2 ?? '',
      viralScore: t.viralScore != null ? t.viralScore.toFixed(4) : '',
      rightsComplexity: t.rightsComplexityScore != null ? t.rightsComplexityScore.toFixed(4) : '',
      spotifyStreams: t.spotifyStreamsLatest ?? '',
      tiktokViews: String(t.tiktokViews ?? ''),
      tiktokVelocity: (t.tiktokVelocity ?? 0).toFixed(2),
      luminateStreams: t.luminateStreamsLatest ?? '',
      pitchStatus: 'Not Pitched',
    }));

    const filename = `ar-radar-${code2}-${date ?? new Date().toISOString().slice(0, 10)}.csv`;
    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return toCsvResponse(rows, CSV_COLUMNS, filename);
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return Response.json({ error: message }, { status });
  }
}
