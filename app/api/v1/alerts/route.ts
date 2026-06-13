import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { validateWebhookUrl } from '@/lib/platform/webhook-url';

const endpoint = '/api/v1/alerts';

const VALID_METRICS = ['viralScore', 'breakProbability', 'streams7dDelta'];
const VALID_OPERATORS = ['gt', 'lt'];
const VALID_CHANNELS = ['email', 'webhook'];
const VALID_ENTITY_TYPES = ['track', 'artist', 'watchlist'];

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'alerts:read');
    await enforceRateLimit(ctx, 'alerts:read', 100);

    const rules = await db.alertRule.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj: rules });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'alerts:write');
    await enforceRateLimit(ctx, 'alerts:write', 20);

    const body = await req.json();
    const { entityType, entityId, metric, threshold, operator = 'gt', channel, destination } = body;

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return NextResponse.json({ error: `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!VALID_METRICS.includes(metric)) {
      return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return NextResponse.json({ error: `operator must be one of: ${VALID_OPERATORS.join(', ')}` }, { status: 400 });
    }
    if (!VALID_CHANNELS.includes(channel)) {
      return NextResponse.json({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` }, { status: 400 });
    }
    if (typeof threshold !== 'number') {
      return NextResponse.json({ error: 'threshold must be a number' }, { status: 400 });
    }
    if (!destination) {
      return NextResponse.json({ error: 'destination (email or webhook URL) is required' }, { status: 400 });
    }

    if (channel === 'webhook') {
      validateWebhookUrl(destination); // throws 400 if URL targets private ranges
    }

    const rule = await db.alertRule.create({
      data: {
        tenantId: ctx.tenantId,
        entityType,
        entityId: entityId ?? null,
        metric,
        threshold,
        operator,
        channel,
        destination,
        isActive: true,
      },
    });

    await logRequest(ctx, endpoint, 'POST', 201, startedAt);
    return NextResponse.json({ obj: rule }, { status: 201 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
