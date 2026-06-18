// lib/utils/api.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger';
import type { PaginationMeta } from '@/lib/types';

// ─── Standard response builders ────────────────────────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export function paginated<T>(data: T[], meta: PaginationMeta) {
  return NextResponse.json({ ok: true, data, meta });
}

export function zodErr(error: ZodError) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: error.flatten().fieldErrors,
    },
    { status: 422 },
  );
}

// ─── Route wrapper with global error boundary ────────────────────────────────────────

type Handler = (req: Request, ctx?: unknown) => Promise<NextResponse>;

export function withErrorBoundary(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      logger.error('[API Error]', req.url, e);
      return NextResponse.json(
        { ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }
  };
}

// ─── Parse URL search params ────────────────────────────────────────────────────────

export function parseSearchParams(url: string): Record<string, string> {
  const { searchParams } = new URL(url);
  const out: Record<string, string> = {};
  searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}
