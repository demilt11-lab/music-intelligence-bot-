import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';
import { ScoutSources } from '@/lib/engine';
import { toCsvResponse } from '@/lib/export/csv';
import { emptyTrack } from '@/lib/talentScout/emptyTrack';

const endpoint = '/api/v1/watchlist/export';

const CSV_COLUMNS = [
  'entityType', 'entityId',
  'addedAt', 'viralScore', 'viralScoreDelta',
  'trendLabel', 'pitchStatus',
];

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

    type WItem = { entityType: string; entityId: number; addedAt: Date; notes: string | null };
    const trackIds = (items as WItem[])
      .filter((i) => i.entityType === 'track')
      .map((i) => i.entityId);

    const hydrated = new Map<number, { viralScore: number | null }>();
    if (trackIds.length) {
      const withMl = await ScoutSources.hydrateMlSignals(trackIds.map(emptyTrack));
      for (const t of withMl) hydrated.set(t.trackId, { viralScore: t.viralScore });
    }

    const rows = (items as WItem[]).map((item) => {
      const baseline = item.notes ? (JSON.parse(item.notes) as { baselineViralScore?: number | null }) : null;
      const live = item.entityType === 'track' ? hydrated.get(item.entityId) : null;
      const viralScoreDelta =
        live?.viralScore != null && baseline?.baselineViralScore != null
          ? (live.viralScore - baseline.baselineViralScore).toFixed(4)
          : '';
      return {
        entityType: item.entityType,
        entityId: item.entityId,
        addedAt: item.addedAt.toISOString().slice(0, 10),
        viralScore: live?.viralScore != null ? live.viralScore.toFixed(4) : '',
        viralScoreDelta,
        trendLabel: '',
        pitchStatus: 'Not Pitched',
      };
    });

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return toCsvResponse(rows, CSV_COLUMNS, 'watchlist-export.csv');
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return Response.json({ error: message }, { status });
  }
}
