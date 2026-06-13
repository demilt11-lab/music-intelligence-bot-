/**
 * POST /api/v1/feedback
 *
 * Accepts user-supplied labels for tracks. These labels are collected in the
 * user_feedback table and consumed by the ML retrain pipeline to continuously
 * improve viral and popularity predictions.
 *
 * Required scope: feedback:write
 *
 * Body:
 * {
 *   "items": [
 *     {
 *       "trackId": 12345,
 *       "label": "VIRAL",        // optional: VIRAL | TRENDING | POPULAR | NONE
 *       "isViral": true,         // optional: explicit viral flag
 *       "isPopular": false,      // optional: explicit popularity flag
 *       "notes": "heard on radio", // optional
 *       "source": "curator"      // optional: curator | ar | user | algorithm
 *     }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';

const VALID_LABELS = ['VIRAL', 'TRENDING', 'POPULAR', 'NONE'];
const VALID_SOURCES = ['curator', 'ar', 'user', 'algorithm'];
const endpoint = '/api/v1/feedback';

type FeedbackItem = {
  trackId: number;
  label?: string;
  isViral?: boolean;
  isPopular?: boolean;
  notes?: string;
  source?: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'feedback:write');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:feedback`, 500);

    const body = await req.json();
    const items: FeedbackItem[] = body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
    }

    if (items.length > 200) {
      return NextResponse.json({ error: 'max 200 items per request' }, { status: 400 });
    }

    for (const item of items) {
      if (!item.trackId || typeof item.trackId !== 'number') {
        return NextResponse.json({ error: 'each item requires a numeric trackId' }, { status: 400 });
      }
      if (item.label && !VALID_LABELS.includes(item.label)) {
        return NextResponse.json(
          { error: `label must be one of: ${VALID_LABELS.join(', ')}` },
          { status: 400 },
        );
      }
      if (item.source && !VALID_SOURCES.includes(item.source)) {
        return NextResponse.json(
          { error: `source must be one of: ${VALID_SOURCES.join(', ')}` },
          { status: 400 },
        );
      }
    }

    await db.userFeedback.createMany({
      data: items.map((item) => ({
        tenantId: ctx!.tenantId,
        trackId: item.trackId,
        label: item.label ?? null,
        isViral: item.isViral ?? null,
        isPopular: item.isPopular ?? null,
        notes: item.notes ?? null,
        source: item.source ?? null,
      })),
    });

    await logRequest(ctx, endpoint, 'POST', 202, startedAt);
    return NextResponse.json({ accepted: items.length }, { status: 202 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
