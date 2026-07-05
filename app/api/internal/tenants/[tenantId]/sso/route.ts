// app/api/internal/tenants/[tenantId]/sso/route.ts
//
// Management-plane CRUD for a tenant's SSO connections. Guarded by the internal
// admin secret (same as the other /api/internal routes). Client secrets and IdP
// certs are write-only here — GET never echoes them back.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import type { Prisma, SsoProtocol, TenantRole } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ tenantId: string }> };

const PROTOCOLS: SsoProtocol[] = ['OIDC', 'SAML'];
const ROLES: TenantRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];

/** Strip secrets before returning a connection to the caller. */
function redact(conn: Record<string, any>) {
  const { oidcClientSecret, samlCert, ...safe } = conn;
  return {
    ...safe,
    oidcClientSecretSet: Boolean(oidcClientSecret),
    samlCertSet: Boolean(samlCert),
  };
}

export async function GET(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = Number((await props.params).tenantId);
  if (!Number.isInteger(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 });
  }

  const connections = await db.ssoConnection.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ obj: connections.map(redact) }, { status: 200 });
}

export async function POST(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = Number((await props.params).tenantId);
  if (!Number.isInteger(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  const protocol = body?.protocol as SsoProtocol | undefined;
  const emailDomain = (body?.emailDomain as string | undefined)?.trim().toLowerCase();
  const displayName = (body?.displayName as string | undefined)?.trim();

  if (!protocol || !PROTOCOLS.includes(protocol)) {
    return NextResponse.json({ error: 'protocol must be OIDC or SAML' }, { status: 400 });
  }
  if (!emailDomain || !displayName) {
    return NextResponse.json({ error: 'displayName and emailDomain are required' }, { status: 400 });
  }
  const defaultRole: TenantRole = ROLES.includes(body?.defaultRole)
    ? (body!.defaultRole as TenantRole)
    : 'VIEWER';

  if (protocol === 'OIDC' && (!body?.oidcIssuer || !body?.oidcClientId)) {
    return NextResponse.json({ error: 'OIDC requires oidcIssuer and oidcClientId' }, { status: 400 });
  }
  if (protocol === 'SAML' && (!body?.samlEntryPoint || !body?.samlCert)) {
    return NextResponse.json({ error: 'SAML requires samlEntryPoint and samlCert' }, { status: 400 });
  }

  const data: Prisma.SsoConnectionUncheckedCreateInput = {
    tenantId,
    protocol,
    displayName,
    emailDomain,
    defaultRole,
    enabled: body?.enabled ?? true,
    oidcIssuer: body?.oidcIssuer ?? null,
    oidcClientId: body?.oidcClientId ?? null,
    oidcClientSecret: body?.oidcClientSecret ?? null,
    oidcScopes: body?.oidcScopes ?? undefined,
    samlEntryPoint: body?.samlEntryPoint ?? null,
    samlIssuer: body?.samlIssuer ?? null,
    samlCert: body?.samlCert ?? null,
    samlAudience: body?.samlAudience ?? null,
  };

  try {
    const conn = await db.ssoConnection.create({ data });
    return NextResponse.json({ obj: redact(conn) }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: `A connection for ${emailDomain} already exists` }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest, props: RouteParams) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  const tenantId = Number((await props.params).tenantId);
  const connectionId = Number(req.nextUrl.searchParams.get('connectionId'));
  if (!Number.isInteger(tenantId) || !Number.isInteger(connectionId)) {
    return NextResponse.json({ error: 'Invalid tenant or connection id' }, { status: 400 });
  }
  const { count } = await db.ssoConnection.deleteMany({ where: { id: connectionId, tenantId } });
  return NextResponse.json({ obj: { deleted: count } }, { status: count > 0 ? 200 : 404 });
}
