import { NextRequest } from 'next/server';
import { requireSession, AuthError } from '@/lib/auth/guard';
import { listWatchlist } from '@/lib/watchlist/service';
import { toCsvResponse } from '@/lib/export/csv';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CSV_COLUMNS = [
  'entityType',
  'entityId',
  'entityName',
  'artistNames',
  'addedAt',
  'viralScore',
  'viralScoreDelta',
  'trendLabel',
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req);
    const items = await listWatchlist(user.tenantId);

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

    return toCsvResponse(rows, CSV_COLUMNS, 'watchlist-export.csv');
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    logger.error('[ui/watchlist/export] failed:', err);
    return Response.json({ error: 'Failed to export watchlist' }, { status: 500 });
  }
}
