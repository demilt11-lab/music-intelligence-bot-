// app/api/internal/tenants/[tenantId]/scim-token/route.ts
//
// Mint / list / revoke the per-tenant SCIM bearer tokens the customer's IdP uses
// to call our provisioning API. The raw token is returned exactly once, on
// creation; only its SHA-256 hash is stored.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { generateScimToken } from '@/lib/auth/scim/token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ tenantId: string }> };

function tenantIdOf(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = tenantIdOf((await props.params).tenantId);
  if (tenantId == null) return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 });

  const tokens = await db.scimToken.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return NextResponse.json({ obj: tokens }, { status: 200 });
}

export async function POST(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = tenantIdOf((await props.params).tenantId);
  if (tenantId == null) return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const { raw, hash } = generateScimToken();
  const record = await db.scimToken.create({
    data: { tenantId, tokenHash: hash, label: body.label ?? 'SCIM token' },
  });

  // Raw token shown once — never stored, cannot be recovered.
  return NextResponse.json(
    { obj: { id: record.id, label: record.label, token: raw } },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = tenantIdOf((await props.params).tenantId);
  const tokenId = Number(req.nextUrl.searchParams.get('tokenId'));
  if (tenantId == null || !Number.isInteger(tokenId)) {
    return NextResponse.json({ error: 'Invalid tenant or token id' }, { status: 400 });
  }
  const { count } = await db.scimToken.updateMany({
    where: { id: tokenId, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ obj: { revoked: count } }, { status: count > 0 ? 200 : 404 });
}
