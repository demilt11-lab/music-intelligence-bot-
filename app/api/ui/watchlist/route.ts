// app/api/ui/watchlist/route.ts
//
// First-party watchlist endpoints for the web UI. Tenant is resolved
// server-side (see lib/platform/ui-tenant) so no API key ever reaches the
// browser. External integrations should use /api/v1/watchlist instead.
import { NextRequest, NextResponse } from 'next/server';
import { getUiTenantId } from '@/lib/platform/ui-tenant';
import {
  listWatchlist,
  addWatchlistItem,
  removeWatchlistItemByEntity,
} from '@/lib/watchlist/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tenantId = await getUiTenantId();
    const items = await listWatchlist(tenantId);
    return NextResponse.json({ obj: items, meta: { count: items.length } });
  } catch (err) {
    console.error('[ui/watchlist] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load watchlist' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      entityType?: string;
      entityId?: unknown;
    };
    const { entityType, entityId } = body;

    if (
      (entityType !== 'track' && entityType !== 'artist') ||
      !Number.isInteger(entityId)
    ) {
      return NextResponse.json(
        { error: 'entityType must be track|artist, entityId must be an integer' },
        { status: 400 },
      );
    }

    const tenantId = await getUiTenantId();
    const item = await addWatchlistItem(tenantId, entityType, entityId as number);
    return NextResponse.json({ obj: item }, { status: 201 });
  } catch (err) {
    console.error('[ui/watchlist] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to add watchlist item' },
      { status: 500 },
    );
  }
}

/** Toggle-style removal by entity reference: DELETE ?entityType=track&entityId=42 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType') ?? '';
    const entityId = Number(searchParams.get('entityId'));

    if (!['track', 'artist'].includes(entityType) || !Number.isInteger(entityId)) {
      return NextResponse.json(
        { error: 'entityType must be track|artist, entityId must be an integer' },
        { status: 400 },
      );
    }

    const tenantId = await getUiTenantId();
    const removed = await removeWatchlistItemByEntity(tenantId, entityType, entityId);
    return NextResponse.json({ obj: { removed } });
  } catch (err) {
    console.error('[ui/watchlist] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to remove watchlist item' },
      { status: 500 },
    );
  }
}
