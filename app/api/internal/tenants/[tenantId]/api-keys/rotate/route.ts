// app/api/internal/tenants/[tenantId]/api-keys/rotate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

type RouteParams = { params: Promise<{ tenantId: string }> };

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const tenantId = Number(params.tenantId);
  if (!Number.isFinite(tenantId)) {
    return NextResponse.json(
      { error: 'Invalid tenant id' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    keyId?: number;
    label?: string;
    scopes?: string;
    expiresAt?: string;
  };

  const keyId = body?.keyId;

  const existing = keyId
    ? await db.apiKey.findUnique({ where: { id: keyId } })
    : null;

  if (keyId && (!existing || existing.tenantId !== tenantId)) {
    return NextResponse.json(
      { error: 'API key not found for tenant' },
      { status: 404 },
    );
  }

  // revoke existing key if provided
  if (existing) {
    await db.apiKey.update({
      where: { id: existing.id },
      data: { isRevoked: true },
    });
  }

  const { raw, hash } = generateApiKey();
  const scopes =
    body?.scopes ??
    existing?.scopes ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  const expiresAt =
    body?.expiresAt != null ? new Date(body.expiresAt) : existing?.expiresAt ?? null;

  const label = body?.label ?? existing?.label ?? 'Rotated API key';

  const key = await db.apiKey.create({
    data: {
      tenantId,
      keyHash: hash,
      label,
      scopes,
      expiresAt: expiresAt ?? undefined,
    },
  });

  return NextResponse.json(
    {
      obj: {
        id: key.id,
        tenantId: key.tenantId,
        label: key.label,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
        apiKey: raw,
      },
    },
    { status: 201 },
  );
}
