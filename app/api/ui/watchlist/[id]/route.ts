import { NextRequest, NextResponse } from 'next/server';
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard';
import { removeWatchlistItemById } from '@/lib/watchlist/service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid watchlist item id' }, { status: 400 });
    }

    const removed = await removeWatchlistItemById(user.tenantId, id);
    if (!removed) {
      return NextResponse.json({ error: 'Watchlist item not found' }, { status: 404 });
    }
    return NextResponse.json({ obj: { removed: true } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[ui/watchlist/:id] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to remove watchlist item' },
      { status: 500 },
    );
  }
}
