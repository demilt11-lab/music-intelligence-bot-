// lib/platform/context.ts
import { NextRequest } from 'next/server';
import { getTenantByApiKey } from './auth';

export type RequestContext = {
  tenantId: number;
  scopes: string[];
  requestId: string;
};

export async function buildRequestContext(
  req: NextRequest,
): Promise<RequestContext> {
  const apiKey = req.headers.get('x-api-key');

  if (!apiKey) {
    const err: any = new Error('Missing API key');
    err.status = 401;
    throw err;
  }

  const { tenantId, scopes } = await getTenantByApiKey(apiKey);

  const requestId =
    req.headers.get('x-request-id') ||
    `req_${Math.random().toString(36).slice(2)}`;

  return { tenantId, scopes, requestId };
}

export function requireScope(ctx: RequestContext, scope: string) {
  if (!ctx.scopes.includes(scope)) {
    const err: any = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }
}
