import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { assertSameOrigin, AuthError } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
