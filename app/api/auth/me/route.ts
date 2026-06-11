import { NextRequest, NextResponse } from 'next/server';
import { requireSession, AuthError } from '@/lib/auth/guard';
import { authEnabled } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req);
    return NextResponse.json({
      obj: { email: user.email, role: user.role, authEnabled: authEnabled() },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
