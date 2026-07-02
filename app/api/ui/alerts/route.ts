// app/api/ui/alerts/route.ts
//
// First-party alert-rule endpoints for the web UI. Tenant is resolved
// server-side from the session (see lib/auth/guard), so no API key ever
// reaches the browser. External integrations should use /api/v1/alerts
// instead — that surface is API-key scoped, not session-scoped.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSession, assertSameOrigin, AuthError } from '@/lib/auth/guard';
import { enforceKeyedRateLimit } from '@/lib/platform/rate-limit';
import { validateWebhookUrl } from '@/lib/platform/webhook-url';

export const dynamic = 'force-dynamic';

const VALID_ENTITY_TYPES = new Set(['track', 'artist', 'watchlist']);
const VALID_METRICS = new Set(['viralScore', 'breakProbability', 'streams7dDelta']);
const VALID_OPERATORS = new Set(['gt', 'lt']);
const VALID_CHANNELS = new Set(['email', 'webhook']);

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if ((err as { status?: number })?.status) {
    const status = (err as { status: number }).status;
    const message = err instanceof Error ? err.message : fallback;
    return NextResponse.json({ error: message }, { status });
  }
  console.error(`[ui/alerts] ${fallback}:`, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSession(req);
    const rules = await db.alertRule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ obj: rules });
  } catch (err) {
    return errorResponse(err, 'Failed to load alert rules');
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireSession(req);
    await enforceKeyedRateLimit(`tenant:${user.tenantId}`, 'ui:alerts:write', 30);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const entityType = body.entityType;
    const metric = body.metric;
    const operator = body.operator ?? 'gt';
    const channel = body.channel;
    const destination = body.destination;
    const threshold = Number(body.threshold);
    const entityId = body.entityId != null ? Number(body.entityId) : null;

    if (typeof entityType !== 'string' || !VALID_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json(
        { error: `entityType must be one of: ${[...VALID_ENTITY_TYPES].join(', ')}` },
        { status: 400 },
      );
    }
    if (entityType !== 'watchlist' && (!Number.isInteger(entityId) || (entityId as number) <= 0)) {
      return NextResponse.json(
        { error: 'entityId is required (a positive integer) when entityType is track or artist' },
        { status: 400 },
      );
    }
    if (typeof metric !== 'string' || !VALID_METRICS.has(metric)) {
      return NextResponse.json(
        { error: `metric must be one of: ${[...VALID_METRICS].join(', ')}` },
        { status: 400 },
      );
    }
    if (typeof operator !== 'string' || !VALID_OPERATORS.has(operator)) {
      return NextResponse.json(
        { error: `operator must be one of: ${[...VALID_OPERATORS].join(', ')}` },
        { status: 400 },
      );
    }
    if (typeof channel !== 'string' || !VALID_CHANNELS.has(channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}` },
        { status: 400 },
      );
    }
    if (!Number.isFinite(threshold)) {
      return NextResponse.json({ error: 'threshold must be a number' }, { status: 400 });
    }
    if (typeof destination !== 'string' || destination.trim().length === 0) {
      return NextResponse.json(
        { error: 'destination (email address or webhook URL) is required' },
        { status: 400 },
      );
    }

    if (channel === 'webhook') {
      await validateWebhookUrl(destination); // throws 400 if URL targets private/internal ranges
    } else if (channel === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
        return NextResponse.json({ error: 'destination must be a valid email address' }, { status: 400 });
      }
    }

    const rule = await db.alertRule.create({
      data: {
        tenantId: user.tenantId,
        entityType,
        entityId: entityType === 'watchlist' ? null : entityId,
        metric,
        threshold,
        operator,
        channel,
        destination,
        isActive: true,
      },
    });

    return NextResponse.json({ obj: rule }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Failed to create alert rule');
  }
}
