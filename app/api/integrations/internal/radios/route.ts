// app/api/integrations/internal/radios/route.ts

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
