import { NextRequest } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { toCsvResponse } from '@/lib/export/csv';
import { listWatchlist } from '@/lib/watchlist/service';

const endpoint = '/api/v1/watchlist/export';

const CSV_COLUMNS = [
  'entityType', 'entityId', 'entityName', 'artistNames',
  'addedAt', 'viralScore', 'viralScoreDelta', 'trendLabel',
];

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:watchlist:export`, 10);

    const items = await listWatchlist(ctx.tenantId);

    const rows = items.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: item.entityName ?? '',
      artistNames: item.artistNames.join('; '),
      addedAt: item.addedAt.toISOString().slice(0, 10),
      viralScore: item.viralScore != null ? item.viralScore.toFixed(4) : '',
      viralScoreDelta:
        item.viralScoreDelta != null ? item.viralScoreDelta.toFixed(4) : '',
      trendLabel: item.trendLabel ?? '',
    }));

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return toCsvResponse(rows, CSV_COLUMNS, 'watchlist-export.csv');
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return Response.json({ error: message }, { status });
  }
}
