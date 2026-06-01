import { NextRequest, NextResponse } from 'next/server';

// Routes that bypass API key checks (public health + OPTIONS preflight)
const PUBLIC_PATTERNS = [
  /^\/api\/health(\/.*)?$/,
  /^\/api\/public\//,
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-request-id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Attach request ID if not already present
  const requestId =
    req.headers.get('x-request-id') ?? `req_${Math.random().toString(36).slice(2, 11)}`;

  const res = NextResponse.next();
  res.headers.set('x-request-id', requestId);

  // Warn if API routes are called without an API key (doesn't block — actual auth is in each route)
  const isApiRoute = pathname.startsWith('/api/');
  const isPublic = PUBLIC_PATTERNS.some((p) => p.test(pathname));
  if (isApiRoute && !isPublic && !req.headers.get('x-api-key')) {
    // Let the route handler return the 401 — just flag for observability
    res.headers.set('x-auth-missing', '1');
  }

  return res;
}

export const config = {
  matcher: [
    // Apply to all API routes
    '/api/:path*',
  ],
};
