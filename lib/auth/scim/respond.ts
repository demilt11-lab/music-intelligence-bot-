// lib/auth/scim/respond.ts
import { NextResponse } from 'next/server';
import { scimError } from './user';

export const SCIM_CONTENT_TYPE = 'application/scim+json';

export function scimJson(obj: unknown, status = 200): NextResponse {
  return NextResponse.json(obj, {
    status,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
  });
}

/** Map a thrown error (with optional `.status`) to a SCIM error response. */
export function scimErrorResponse(err: unknown): NextResponse {
  const status = typeof (err as any)?.status === 'number' ? (err as any).status : 500;
  const detail = err instanceof Error ? err.message : 'SCIM request failed';
  if (status >= 500) console.error('[scim]', err);
  return scimJson(scimError(status, detail), status);
}
