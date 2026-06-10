import { NextRequest, NextResponse } from 'next/server';
import { getUiTenantId } from '@/lib/platform/ui-tenant';
import { removeWatchlistItemById } from '@/lib/watchlist/service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid watchlist item id' }, { status: 400 });
    }

    const tenantId = await getUiTenantId();
    const removed = await removeWatchlistItemById(tenantId, id);

    if (!removed) {
      return NextResponse.json({ error: 'Watchlist item not found' }, { status: 404 });
    }
    return NextResponse.json({ obj: { removed: true } });
  } catch (err) {
    console.error('[ui/watchlist/:id] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to remove watchlist item' },
      { status: 500 },
    );
  }
}
