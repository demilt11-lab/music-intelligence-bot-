// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAiConfigured } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Readiness probe. Reports core dependency status without leaking secret
 * values — integration flags are booleans (key present / absent) only, so this
 * is safe to expose. Use it to confirm a deploy is correctly configured.
 */
export async function GET() {
  let dbUp = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }

  const has = (name: string) => Boolean(process.env[name]);

  const integrations = {
    spotify: has('SPOTIFY_CLIENT_ID') && has('SPOTIFY_CLIENT_SECRET'),
    youtube: has('YOUTUBE_API_KEY'),
    luminate: has('LUMINATE_API_KEY'),
    tiktok: has('TIKTOK_CLIENT_KEY') || has('RAPIDAPI_KEY'),
    shazam: has('SHAZAM_API_KEY'),
    instagram: has('META_APP_ID') && has('META_APP_SECRET'),
    googleTrends: has('SEARCHAPI_KEY'),
    billboard: has('FIRECRAWL_API_KEY'),
    ai: isAiConfigured(),
    redis: has('UPSTASH_REDIS_URL') && has('UPSTASH_REDIS_TOKEN'),
  };

  return NextResponse.json(
    {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      integrations,
      time: new Date().toISOString(),
    },
    { status: dbUp ? 200 : 503 },
  );
}
