// lib/auth/session.ts
//
// Session management for the first-party UI.
//
// Token design (edge-compatible):
//   token = <sessionId>.<expiresEpochSec>.<hmacSha256(secret, id + "." + exp)>
// The middleware (edge runtime, no DB) verifies the HMAC + expiry to gate
// pages cheaply; API routes ALSO check the Session row in Postgres so
// individual sessions can be revoked server-side. Only a SHA-256 of the
// token is stored — a DB leak does not yield usable cookies.
//
// AUTH_SECRET is required in production (fail closed). In development and
// test, when AUTH_SECRET is unset, auth is disabled with a loud warning so
// local hacking stays frictionless.
import { createHash, createHmac, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'nv8_session';
const SESSION_TTL_DAYS = 7;

export function authEnabled(): boolean {
  if (process.env.AUTH_SECRET) return true;
  if (process.env.NODE_ENV === 'production') return true; // fail closed: enabled but unusable
  return false;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not configured');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionUser = {
  userId: number;
  tenantId: number;
  email: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
};

export async function createSession(user: {
  id: number;
  tenantId: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const id = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const expSec = Math.floor(expiresAt.getTime() / 1000);
  const token = `${id}.${expSec}.${sign(`${id}.${expSec}`)}`;

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/** Full validation: signature + expiry + live DB row (revocation-aware). */
export async function validateSessionToken(
  token: string | undefined | null,
): Promise<SessionUser | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, expStr, mac] = parts;
  if (sign(`${id}.${expStr}`) !== mac) return null;
  if (Number(expStr) * 1000 < Date.now()) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  // Touch lastSeenAt at most once a minute to avoid a write per request.
  // Fire-and-forget intentionally — a missed touch doesn't affect auth decisions
  // (expiry is enforced by expiresAt, not lastSeenAt). Log warnings so transient
  // DB issues are visible without blocking the request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch((err: Error) => console.warn('[session] lastSeenAt update failed:', err.message));
  }

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await db.session
    .updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => {});
}

export async function revokeAllUserSessions(userId: number): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}

/** Read the session from the request cookie (server components / routes). */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!authEnabled()) {
    // Dev open mode: act as the workspace admin without a cookie.
    return null;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
