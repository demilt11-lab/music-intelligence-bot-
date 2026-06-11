// lib/auth/guard.ts
//
// Route-level session enforcement for first-party (/api/ui, /api/auth) and
// internal endpoints. When auth is disabled (dev without AUTH_SECRET) the
// guard degrades to the legacy single-workspace tenant so local development
// needs no setup.
import { NextRequest } from 'next/server';
import { authEnabled, validateSessionToken, SESSION_COOKIE, SessionUser } from './session';
import { getUiTenantId } from '@/lib/platform/ui-tenant';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve the acting user for a UI request.
 * Throws AuthError(401) when auth is enabled and the session is missing/bad.
 */
export async function requireSession(req: NextRequest): Promise<SessionUser> {
  if (!authEnabled()) {
    const tenantId = await getUiTenantId();
    return { userId: 0, tenantId, email: 'dev@local', role: 'ADMIN' };
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = await validateSessionToken(token);
  if (!user) throw new AuthError('Not authenticated');
  return user;
}

const ROLE_RANK: Record<SessionUser['role'], number> = {
  VIEWER: 0,
  ANALYST: 1,
  ADMIN: 2,
};

export function requireRole(user: SessionUser, minimum: SessionUser['role']): void {
  if (ROLE_RANK[user.role] < ROLE_RANK[minimum]) {
    throw new AuthError(`Requires ${minimum} role`, 403);
  }
}

/**
 * CSRF defense for mutating first-party endpoints: cookies are SameSite=Lax,
 * and we additionally require same-origin (or absent, for non-browser tools)
 * Origin headers on state-changing requests.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // curl/server-side callers
  const host = req.headers.get('host');
  try {
    if (new URL(origin).host !== host) {
      throw new AuthError('Cross-origin request rejected', 403);
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('Invalid Origin header', 403);
  }
}
