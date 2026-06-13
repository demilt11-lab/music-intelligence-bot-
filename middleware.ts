// middleware.ts — lightweight session gate for all dashboard API routes.
//
// Runs in the Edge Runtime (no DB). Verifies the session token's HMAC +
// expiry so unprotected dashboard routes are covered without touching each
// individual file. Full revocation checks (DB row lookup) are still done
// by routes that call requireSession() explicitly.
//
// Auth bypass list — routes that carry their own authentication mechanism:
//   /api/health       — intentionally public
//   /api/v1/*         — x-api-key header (tenant API key)
//   /api/cron/*       — CRON_SECRET header
//   /api/public/*     — own auth layer
//   /api/auth/*       — login / logout / session creation
//   /api/internal/*   — INTERNAL_ADMIN_SECRET bearer token
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'nv8_session';

const AUTH_BYPASSES = [
  '/api/health',
  '/api/v1/',
  '/api/cron/',
  '/api/public/',
  '/api/auth/',
  '/api/internal/',
];

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, expStr, mac] = parts;
  if (Number(expStr) * 1000 < Date.now()) return false;
  const expected = await hmacHex(secret, `${id}.${expStr}`);
  return expected === mac;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/api/')) return NextResponse.next();

  for (const prefix of AUTH_BYPASSES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // Dev open mode: when AUTH_SECRET is absent, mirror requireSession() behaviour
  // and pass through so local development needs no setup.
  if (!process.env.AUTH_SECRET) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
