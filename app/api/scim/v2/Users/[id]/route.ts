// app/api/scim/v2/Users/[id]/route.ts
//
// SCIM 2.0 single-user resource: GET, PUT (replace), PATCH (partial update,
// incl. `active=false` deprovisioning), DELETE. Deactivation immediately
// revokes the user's live sessions so deprovisioning is effective at once.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { authenticateScimRequest } from '@/lib/auth/scim/token';
import {
  toScimUser,
  scimError,
  mutationFromScimBody,
  mutationFromScimPatch,
  type ScimUserInput,
  type UserMutation,
} from '@/lib/auth/scim/user';
import { scimJson, scimErrorResponse } from '@/lib/auth/scim/respond';
import { spBaseUrl } from '@/lib/auth/sso/connection';
import type { TenantUser } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ id: string }> };

async function loadScoped(req: NextRequest, idStr: string): Promise<{ tenantId: number; user: TenantUser | null }> {
  const { tenantId } = await authenticateScimRequest(req);
  const id = Number(idStr);
  if (!Number.isInteger(id)) return { tenantId, user: null };
  // Scoped read: a token for tenant A can never load tenant B's user.
  const user = await db.tenantUser.findFirst({ where: { id, tenantId } });
  return { tenantId, user };
}

async function applyMutation(user: TenantUser, mutation: UserMutation): Promise<TenantUser> {
  const updated = await db.tenantUser.update({
    where: { id: user.id },
    data: {
      email: mutation.email ?? undefined,
      externalId: mutation.externalId ?? undefined,
      role: mutation.role ?? undefined,
      isActive: mutation.isActive ?? undefined,
    },
  });
  // Deprovisioning must end live sessions immediately.
  if (mutation.isActive === false) {
    await revokeAllUserSessions(user.id).catch(() => {});
  }
  return updated;
}

export async function GET(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    const { user } = await loadScoped(req, id);
    if (!user) return scimJson(scimError(404, 'User not found'), 404);
    return scimJson(toScimUser(user, spBaseUrl()));
  } catch (err) {
    return scimErrorResponse(err);
  }
}

export async function PUT(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    const { user } = await loadScoped(req, id);
    if (!user) return scimJson(scimError(404, 'User not found'), 404);
    const body = (await req.json().catch(() => ({}))) as ScimUserInput;
    const updated = await applyMutation(user, mutationFromScimBody(body));
    return scimJson(toScimUser(updated, spBaseUrl()));
  } catch (err) {
    return scimErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    const { user } = await loadScoped(req, id);
    if (!user) return scimJson(scimError(404, 'User not found'), 404);
    const body = (await req.json().catch(() => ({}))) as { Operations?: unknown[] };
    const updated = await applyMutation(user, mutationFromScimPatch(body as any));
    return scimJson(toScimUser(updated, spBaseUrl()));
  } catch (err) {
    return scimErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, props: RouteParams) {
  try {
    const { id } = await props.params;
    const { user } = await loadScoped(req, id);
    if (!user) return scimJson(scimError(404, 'User not found'), 404);
    // Soft-delete: keep the row (and its audit trail) but deactivate + kill sessions.
    await applyMutation(user, { isActive: false });
    return new Response(null, { status: 204 });
  } catch (err) {
    return scimErrorResponse(err);
  }
}
