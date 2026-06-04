// withAuth HOF and NextResponse header helpers
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, requireScope, logUsage, ApiKeyRecord } from './api-key';
import { rateLimit } from './rate-limit';

export type AuthContext = {
  key: ApiKeyRecord;
  startTime: number;
};

export type AuthedHandler = (
  req: NextRequest,
  ctx: AuthContext,
  ...args: unknown[]
) => Promise<NextResponse>;

export function withAuth(scope: string, handler: AuthedHandler) {
  return async (req: NextRequest, ...routeArgs: unknown[]): Promise<NextResponse> => {
    const startTime = Date.now();

    // 1. Extract Bearer token
    const authHeader = req.headers.get('authorization') ?? '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    const rawKey = match[1];

    // 2. Validate API key
    let key: ApiKeyRecord | null;
    try {
      key = await validateApiKey(rawKey);
    } catch {
      return NextResponse.json(
        { error: 'Internal error validating API key', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }
    if (!key) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    // 3. Rate limit
    const rl = rateLimit(key.id.toString());
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Limit': String(key.rateLimit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rl.resetAt.toISOString(),
          },
        },
      );
    }

    // 4. Scope check
    try {
      await requireScope(key, scope);
    } catch {
      return NextResponse.json(
        { error: `Missing required scope: ${scope}`, code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    // 5. Call handler
    const response = await handler(req, { key, startTime }, ...routeArgs);

    // 6. Log usage (fire-and-forget)
    const elapsed = Date.now() - startTime;
    logUsage(key.id, req.nextUrl.pathname, response.status, elapsed);

    // 7. Add rate limit headers
    response.headers.set('X-RateLimit-Limit', String(key.rateLimit));
    response.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    response.headers.set('X-RateLimit-Reset', rl.resetAt.toISOString());

    return response;
  };
}

export function withOptionalAuth(
  handler: (req: NextRequest, ctx: AuthContext | null, ...args: unknown[]) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ...routeArgs: unknown[]): Promise<NextResponse> => {
    const startTime = Date.now();
    const authHeader = req.headers.get('authorization') ?? '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return handler(req, null, ...routeArgs);
    }

    const rawKey = match[1];
    let key: ApiKeyRecord | null = null;
    try {
      key = await validateApiKey(rawKey);
    } catch {
      // swallow errors for optional auth
    }

    const ctx: AuthContext | null = key ? { key, startTime } : null;
    return handler(req, ctx, ...routeArgs);
  };
}
