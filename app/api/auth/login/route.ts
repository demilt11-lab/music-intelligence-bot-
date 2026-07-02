import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import {
  authEnabled,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth/session';
import { assertSameOrigin, AuthError } from '@/lib/auth/guard';
import { enforceKeyedRateLimit } from '@/lib/platform/rate-limit';
import { getUiTenantId } from '@/lib/platform/ui-tenant';

export const dynamic = 'force-dynamic';

// Fixed-window per-IP limiter against credential stuffing. Backed by Upstash
// when configured (shared across every serverless instance); degrades to a
// real per-instance in-memory limiter otherwise — never allow-all.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

async function rateLimited(ip: string): Promise<boolean> {
  try {
    await enforceKeyedRateLimit(ip, 'auth:login', MAX_ATTEMPTS, WINDOW_MS);
    return false;
  } catch (err: any) {
    if (err?.status === 429) return true;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);

    if (!authEnabled()) {
      return NextResponse.json(
        { error: 'Auth is disabled in this environment (AUTH_SECRET unset)' },
        { status: 400 },
      );
    }
    if (!process.env.AUTH_SECRET) {
      // Production with no secret: fail closed and say why.
      return NextResponse.json(
        { error: 'Server auth is misconfigured (AUTH_SECRET missing)' },
        { status: 503 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (await rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts — try again in 15 minutes' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Scoped to the UI's single workspace tenant (see lib/platform/ui-tenant) —
    // TenantUser.email is only unique per-tenant, and an unscoped lookup would
    // resolve to whichever tenant happens to have the lowest id if the same
    // email were ever provisioned under more than one.
    const tenantId = await getUiTenantId();
    const user = await db.tenantUser.findFirst({
      where: { email, tenantId },
    });

    // Constant-shape failure: same message whether the user or password is wrong.
    if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { token, expiresAt } = await createSession({
      id: user.id,
      tenantId: user.tenantId,
    });

    const res = NextResponse.json({
      ok: true,
      user: { email: user.email, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
