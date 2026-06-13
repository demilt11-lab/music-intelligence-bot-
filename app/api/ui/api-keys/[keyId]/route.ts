import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

type RouteParams = { params: Promise<{ keyId: string }> };

export async function DELETE(req: NextRequest, props: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { keyId } = await props.params;
  const id = Number(keyId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Invalid key id' }, { status: 400 });
  }

  const key = await db.apiKey.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!key) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  await db.apiKey.update({
    where: { id, tenantId: user.tenantId },
    data: { isRevoked: true },
  });

  return NextResponse.json({ ok: true });
}
