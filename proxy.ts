import { NextRequest, NextResponse } from 'next/server';

// API routes that bypass both the API-key warning and session checks:
// health, public API, and the auth endpoints themselves.
const PUBLIC_API_PATTERNS = [
  /^\/api\/health(\/.*)?$/,
  /^\/api\/public\//,
  /^\/api\/auth\//,
];

// API namespaces with their own auth: v1 (API keys), cron (CRON_SECRET),
// internal (per-route checks), mcp (session OR x-api-key handled in route).
// Session auth applies to all other /api/* routes.
const SELF_AUTHED_API = [/^\/api\/v1\//, /^\/api\/cron\//, /^\/api\/internal\//, /^\/api\/mcp/];

const SESSION_COOKIE = 'nv8_session';

function authEnabled(): boolean {
  return !!process.env.AUTH_SECRET || process.env.NODE_ENV === 'production';
}

/**
 * Edge-side session pre-check: verify the cookie token's HMAC + expiry with
 * Web Crypto (no DB on the edge). Revocation is enforced by the route layer,
 * which re-validates against the sessions table.
 *
 * Next 16 renamed the middleware convention to proxy (proxy.ts / proxy()).
 */
async function hasPlausibleSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, expStr, mac] = parts;
  if (Number(expStr) * 1000 < Date.now()) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${expStr}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === mac;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProd = process.env.NODE_ENV === 'production';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-request-id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const requestId =
    req.headers.get('x-request-id') ?? `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  // Per-request nonce for CSP — btoa(UUID) is safe in Edge Runtime
  const nonce = btoa(crypto.randomUUID());

  const isApiRoute = pathname.startsWith('/api/');
  const isPublicApi = PUBLIC_API_PATTERNS.some((p) => p.test(pathname));
  const isSelfAuthedApi = SELF_AUTHED_API.some((p) => p.test(pathname));

  if (authEnabled()) {
    // Production with no AUTH_SECRET: fail closed with a clear message
    // instead of silently serving an unprotected app.
    if (!process.env.AUTH_SECRET) {
      if (isPublicApi || pathname === '/login') {
        return NextResponse.next();
      }
      return new NextResponse(
        JSON.stringify({ error: 'Server auth is misconfigured (AUTH_SECRET missing)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const sessionOk = await hasPlausibleSession(req);

    if (!sessionOk) {
      // /api/ui requires a session
      if (isApiRoute && !isPublicApi && !isSelfAuthedApi) {
        return new NextResponse(JSON.stringify({ error: 'Not authenticated' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // App pages redirect to login (except the login page itself)
      if (!isApiRoute && pathname !== '/login' && !pathname.startsWith('/_next')) {
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
        return NextResponse.redirect(url);
      }
    } else if (pathname === '/login') {
      // Already signed in — bounce to home
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Forward nonce and request-id to the route handler via request headers
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-request-id', requestId);
  reqHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('x-request-id', requestId);

  // Nonce-based CSP — replaces the static unsafe-inline from next.config.js.
  // 'strict-dynamic' allows nonce-trusted scripts to load further scripts,
  // so third-party loaders work without needing to enumerate every src.
  const scriptDirectives = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src ${scriptDirectives}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join('; '));

  // Observability flag for v1 calls arriving without an API key
  if (isApiRoute && isSelfAuthedApi && !req.headers.get('x-api-key') && pathname.startsWith('/api/v1/')) {
    res.headers.set('x-auth-missing', '1');
  }

  return res;
}

export const config = {
  matcher: [
    // All API routes + all pages except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)).*)',
  ],
};
