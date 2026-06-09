// lib/platform/cron-auth.ts
import { NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Verifies the `Authorization: Bearer <CRON_SECRET>` header that Vercel Cron
 * (and internal schedulers) use to call `/api/cron/*` endpoints.
 *
 * Security notes:
 * - **Fails closed** when `CRON_SECRET` is not configured. Without this guard a
 *   missing secret would turn into the literal string `"Bearer undefined"`,
 *   which any caller could send to bypass auth.
 * - Uses a constant-time comparison to avoid leaking the secret via timing.
 *
 * @param req - The incoming request.
 * @returns `true` only when the header matches a configured secret.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when unconfigured

  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so short-circuit first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
