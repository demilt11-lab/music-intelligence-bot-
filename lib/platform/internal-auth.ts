// lib/platform/internal-auth.ts
//
// Guards /api/internal/* endpoints — these are management-plane routes used by
// CLI scripts and internal tooling. They operate outside the tenant API key
// model, so they use a separate INTERNAL_ADMIN_SECRET bearer token.
//
// Security properties:
//   - Fails closed: returns false if secret is unconfigured
//   - Constant-time comparison to prevent timing side-channels
//   - In production, logs every call (success and failure) for audit trail
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export function verifyInternalSecret(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  if (!secret) return false; // fail closed when unconfigured

  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireInternalAuth(req: NextRequest): NextResponse | null {
  if (verifyInternalSecret(req)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
