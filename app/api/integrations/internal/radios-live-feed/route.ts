// app/api/integrations/internal/radios-live-feed/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createInternalConnector } from '@/lib/integrations/internal';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const radioSlug = searchParams.get('radioSlug');
  if (!radioSlug) {
    return NextResponse.json(
      { error: 'radioSlug is required' },
      { status: 400 },
    );
  }

  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const offset = Number(searchParams.get('offset') ?? '0');
  const limit = Number(searchParams.get('limit') ?? '100');

  const internal = createInternalConnector();

  const data = await internal.getRadioLiveFeed({
    radioSlug,
    startDate,
    endDate,
    offset,
    limit,
  });

  return NextResponse.json(data);
}
