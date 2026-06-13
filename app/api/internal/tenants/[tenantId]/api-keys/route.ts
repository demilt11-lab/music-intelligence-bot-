// app/api/internal/tenants/[tenantId]/api-keys/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireInternalAuth } from '@/lib/platform/internal-auth';

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

type RouteParams = { params: Promise<{ tenantId: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const params = await props.params;
  const tenantId = Number(params.tenantId);
  if (!Number.isFinite(tenantId)) {
    return NextResponse.json(
      { error: 'Invalid tenant id' },
      { status: 400 },
    );
  }

  const keys = await db.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ obj: keys }, { status: 200 });
}

export async function POST(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const params = await props.params;
  const tenantId = Number(params.tenantId);
  if (!Number.isFinite(tenantId)) {
    return NextResponse.json(
      { error: 'Invalid tenant id' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null) as {
    label?: string;
    scopes?: string;
    expiresAt?: string;
  };

  const label = body?.label ?? 'API key';
  const scopes =
    body?.scopes ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  const expiresAt =
    body?.expiresAt != null ? new Date(body.expiresAt) : null;

  const { raw, hash } = generateApiKey();

  const key = await db.apiKey.create({
    data: {
      tenantId,
      keyHash: hash,
      label,
      scopes,
      expiresAt: expiresAt ?? undefined,
    },
  });

  // return the raw key once — it is never stored and cannot be recovered
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
