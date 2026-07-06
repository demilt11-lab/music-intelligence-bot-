// lib/auth/scim/token.ts
//
// Per-tenant bearer credentials for the SCIM 2.0 provisioning API. Stored only
// as a SHA-256 hash (like API keys); the raw token is shown once at creation.
import crypto from 'crypto';
import { db } from '@/lib/db';

export function hashScimToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateScimToken(): { raw: string; hash: string } {
  const raw = `scim_${crypto.randomBytes(32).toString('hex')}`;
  return { raw, hash: hashScimToken(raw) };
}

/**
 * Authenticate a SCIM request from its `Authorization: Bearer <token>` header.
 * Returns the owning tenantId, or throws a 401. Never reveals whether a token
 * exists for a different tenant.
 */
export async function authenticateScimRequest(req: Request): Promise<{ tenantId: number }> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    const err: any = new Error('Missing bearer token');
    err.status = 401;
    throw err;
  }
  const tokenHash = hashScimToken(match[1].trim());
  const record = await db.scimToken.findFirst({ where: { tokenHash, revokedAt: null } });
  if (!record) {
    const err: any = new Error('Invalid SCIM token');
    err.status = 401;
    throw err;
  }
  // Best-effort usage timestamp; never blocks the request.
  db.scimToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { tenantId: record.tenantId };
}
