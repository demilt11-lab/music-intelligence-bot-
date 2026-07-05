// lib/platform/observability.ts
//
// Self-hosted error tracking + latency APM. No external vendor is required: we
// aggregate errors by fingerprint into the `error_events` table and read them
// (plus RequestLog latency) from an admin surface. If a customer *does* run
// Sentry/Datadog/Slack, set ERROR_WEBHOOK_URL and each new/again error is also
// POSTed there — the DB store is the source of truth either way.
import crypto from 'crypto';
import { db } from '@/lib/db';

/**
 * Normalize a message so semantically-identical errors collapse to one
 * fingerprint: drop digits, UUIDs, hex ids, and quoted literals that vary per
 * occurrence (ids, timestamps) but not per bug.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/'[^']*'/g, "'<v>'")
    .replace(/"[^"]*"/g, '"<v>"')
    .trim()
    .slice(0, 200);
}

/** Stable fingerprint for grouping: route + error name + normalized message. */
export function fingerprintError(route: string, name: string, message: string): string {
  const basis = `${route}\n${name}\n${normalizeMessage(message)}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export type ErrorContext = {
  route?: string;
  method?: string;
  statusCode?: number;
  tenantId?: number;
};

/**
 * Record an error occurrence. Fire-and-forget and hardened to NEVER throw —
 * observability must not break the request it is observing.
 */
export async function captureError(error: unknown, ctx: ErrorContext = {}): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const route = ctx.route ?? 'unknown';
    const name = err.name || 'Error';
    const message = err.message || 'Unknown error';
    const fingerprint = fingerprintError(route, name, message);
    const stackSample = err.stack ? err.stack.slice(0, 2000) : null;

    await db.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        route,
        method: ctx.method,
        statusCode: ctx.statusCode ?? 500,
        errorName: name,
        message,
        stackSample,
        tenantId: ctx.tenantId,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        message,
        stackSample,
        statusCode: ctx.statusCode ?? 500,
        resolvedAt: null, // a recurrence re-opens a resolved fingerprint
      },
    });

    void forwardToWebhook({ fingerprint, route, name, message, ctx });
  } catch {
    // swallow — never let telemetry throw into a request path
  }
}

async function forwardToWebhook(payload: {
  fingerprint: string;
  route: string;
  name: string;
  message: string;
  ctx: ErrorContext;
}): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'music-intelligence',
        level: 'error',
        ...payload.ctx,
        fingerprint: payload.fingerprint,
        route: payload.route,
        error: payload.name,
        message: payload.message,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    // best-effort; the DB row is the durable record
  }
}

/** Exact-rank percentiles over a latency sample (ms). Pure — unit tested. */
export function latencyPercentiles(samples: number[]): {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (samples.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return {
    count: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
  };
}
