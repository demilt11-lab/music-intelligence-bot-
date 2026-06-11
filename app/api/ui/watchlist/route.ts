// app/api/ui/watchlist/route.ts
//
// First-party watchlist endpoints for the web UI. Tenant is resolved
// server-side (see lib/platform/ui-tenant) so no API key ever reaches the
// browser. External integrations should use /api/v1/watchlist instead.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard';
import {
  listWatchlist,
  addWatchlistItem,
  removeWatchlistItemByEntity,
} from '@/lib/watchlist/service';

export const dynamic = 'force-dynamic';

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[ui/watchlist] ${fallback}:`, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req);
    const items = await listWatchlist(user.tenantId);
    return NextResponse.json({ obj: items, meta: { count: items.length } });
  } catch (err) {
    return errorResponse(err, 'Failed to load watchlist');
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);

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

    const item = await addWatchlistItem(user.tenantId, entityType, entityId as number);
    return NextResponse.json({ obj: item }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Failed to add watchlist item');
  }
}

/** Toggle-style removal by entity reference: DELETE ?entityType=track&entityId=42 */
export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType') ?? '';
    const entityId = Number(searchParams.get('entityId'));

    if (!['track', 'artist'].includes(entityType) || !Number.isInteger(entityId)) {
      return NextResponse.json(
        { error: 'entityType must be track|artist, entityId must be an integer' },
        { status: 400 },
      );
    }

    const removed = await removeWatchlistItemByEntity(user.tenantId, entityType, entityId);
    return NextResponse.json({ obj: { removed } });
  } catch (err) {
    return errorResponse(err, 'Failed to remove watchlist item');
  }
}
