// app/api/scim/v2/Users/route.ts
//
// SCIM 2.0 Users collection: list (with `userName eq` filter + pagination) and
// create. Authenticated by a per-tenant SCIM bearer token; every query is
// scoped to that tenant.
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { authenticateScimRequest } from '@/lib/auth/scim/token';
import {
  toScimUser,
  scimListResponse,
  scimError,
  mutationFromScimBody,
  parseUserNameFilter,
  type ScimUserInput,
} from '@/lib/auth/scim/user';
import { scimJson, scimErrorResponse } from '@/lib/auth/scim/respond';
import { spBaseUrl } from '@/lib/auth/sso/connection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await authenticateScimRequest(req);
    const sp = req.nextUrl.searchParams;
    const filterEmail = parseUserNameFilter(sp.get('filter'));
    const startIndex = Math.max(1, Number(sp.get('startIndex') ?? 1) || 1);
    const count = Math.min(200, Math.max(0, Number(sp.get('count') ?? 100) || 100));

    const where = filterEmail ? { tenantId, email: filterEmail } : { tenantId };
    const totalResults = await db.tenantUser.count({ where });
    const users = await db.tenantUser.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: startIndex - 1,
      take: count,
    });

    const base = spBaseUrl();
    return scimJson(
      scimListResponse(
        users.map((u) => toScimUser(u, base)),
        { totalResults, startIndex, itemsPerPage: users.length },
      ),
    );
  } catch (err) {
    return scimErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await authenticateScimRequest(req);
    const body = (await req.json().catch(() => ({}))) as ScimUserInput;
    const mutation = mutationFromScimBody(body);

    if (!mutation.email) {
      return scimJson(scimError(400, 'userName or a primary email is required', 'invalidValue'), 400);
    }

    // SCIM create is not an upsert: a duplicate userName is a 409 (the IdP then
    // reconciles via GET-by-filter + PATCH).
    const existing = await db.tenantUser.findFirst({
      where: { tenantId, email: mutation.email },
    });
    if (existing) {
      return scimJson(scimError(409, `User ${mutation.email} already exists`, 'uniqueness'), 409);
    }

    const user = await db.tenantUser.create({
      data: {
        tenantId,
        email: mutation.email,
        role: mutation.role ?? 'VIEWER', // least privilege by default
        externalId: mutation.externalId,
        isActive: mutation.isActive ?? true,
        provisionedVia: 'scim',
      },
    });

    return scimJson(toScimUser(user, spBaseUrl()), 201);
  } catch (err) {
    return scimErrorResponse(err);
  }
}
