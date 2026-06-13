// app/api/v1/tracks/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { upsertCatalogTracks } from '@/lib/catalog/mapping';

type BulkPayload = {
  tracks: {
    clientTrackId: string;
    isrc?: string | null;
    name?: string | null;
    artistName?: string | null;
    spotifyTrackId?: string | null;
    tiktokSoundId?: string | null;
    youtubeVideoId?: string | null;
  }[];
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'catalog:write');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:catalog:tracks`);

    const body = (await req.json()) as BulkPayload;

    if (!body?.tracks?.length) {
      return NextResponse.json(
        { error: 'tracks array is required' },
        { status: 400 },
      );
    }

    if (body.tracks.length > 500) {
      return NextResponse.json(
        { error: 'max 500 tracks per request' },
        { status: 400 },
      );
    }

    await upsertCatalogTracks(ctx, body.tracks);

    const res = NextResponse.json(
      { obj: { accepted: body.tracks.length } },
      { status: 200 },
    );
    await logRequest(
      ctx,
      '/api/v1/tracks/bulk',
      'POST',
      200,
      startedAt,
    );
    return res;
  } catch (err: any) {
    const status = err.status || 500;
    const message =
      status === 500 ? 'Internal server error' : err.message ?? 'Error';

    if (ctx) {
      await logRequest(
        ctx,
        '/api/v1/tracks/bulk',
        'POST',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
