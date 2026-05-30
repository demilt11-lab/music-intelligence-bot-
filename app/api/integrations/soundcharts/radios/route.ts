import { NextRequest, NextResponse } from 'next/server';
import { createSoundchartsConnector } from '@/lib/integrations/soundcharts';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const offset = Number(searchParams.get('offset') ?? '0');
  const limit = Number(searchParams.get('limit') ?? '25');

  const soundcharts = createSoundchartsConnector({
    appId: process.env.SOUNDCHARTS_APP_ID!,
    apiKey: process.env.SOUNDCHARTS_API_KEY!,
  });

  const data = await soundcharts.getRadios({ offset, limit });

  return NextResponse.json(data);

  // app/api/integrations/soundcharts/radios/route.ts
// (you might want to rename the folder to /integrations/internal/radios later)

import { NextRequest, NextResponse } from 'next/server';
import { createInternalConnector } from '@/lib/integrations/internal';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const offset = Number(searchParams.get('offset') ?? '0');
  const limit = Number(searchParams.get('limit') ?? '25');
  const countryCode = searchParams.get('countryCode') || undefined;
  const search = searchParams.get('search') || undefined;

  const internal = createInternalConnector();

  const data = await internal.getRadios({
    offset,
    limit,
    countryCode,
    search,
  });

  return NextResponse.json(data);
}
}
