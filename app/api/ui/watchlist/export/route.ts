import { getUiTenantId } from '@/lib/platform/ui-tenant';
import { listWatchlist } from '@/lib/watchlist/service';
import { toCsvResponse } from '@/lib/export/csv';

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

export async function GET() {
  try {
    const tenantId = await getUiTenantId();
    const items = await listWatchlist(tenantId);

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
    console.error('[ui/watchlist/export] failed:', err);
    return Response.json({ error: 'Failed to export watchlist' }, { status: 500 });
  }
}
