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

    // Validate
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

    // Write to DB — use raw SQL since user_feedback may not be in Prisma schema yet
    await db.$executeRawUnsafe(
      `
      CREATE TABLE IF NOT EXISTS user_feedback (
        id          SERIAL PRIMARY KEY,
        tenant_id   INTEGER NOT NULL,
        track_id    INTEGER NOT NULL,
        label       TEXT,
        is_viral    BOOLEAN,
        is_popular  BOOLEAN,
        notes       TEXT,
        source      TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );

    let inserted = 0;
    for (const item of items) {
      await db.$executeRawUnsafe(
        `
        INSERT INTO user_feedback (tenant_id, track_id, label, is_viral, is_popular, notes, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        ctx.tenantId,
        item.trackId,
        item.label ?? null,
        item.isViral ?? null,
        item.isPopular ?? null,
        item.notes ?? null,
        item.source ?? null,
      );
      inserted++;
    }

    await logRequest(ctx, endpoint, 'POST', 202, startedAt);
    return NextResponse.json({ accepted: inserted }, { status: 202 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
