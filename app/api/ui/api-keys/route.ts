import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

const DEFAULT_SCOPES =
  'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write,talent-scout:read,usage:read';

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const keys = await db.apiKey.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      scopes: true,
      expiresAt: true,
      isRevoked: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return NextResponse.json({ obj: keys });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { label?: string } | null;
  const label = body?.label?.trim() || 'API key';

  const { raw, hash } = generateApiKey();

  const key = await db.apiKey.create({
    data: {
      tenantId: user.tenantId,
      keyHash: hash,
      label,
      scopes: DEFAULT_SCOPES,
    },
  });

  return NextResponse.json(
    {
      obj: {
        id: key.id,
        label: key.label,
        scopes: key.scopes,
        createdAt: key.createdAt,
        apiKey: raw,
      },
    },
    { status: 201 },
  );
}
