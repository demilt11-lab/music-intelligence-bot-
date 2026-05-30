// app/api/integrations/internal/radios/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createInternalConnector } from '@/lib/integrations/internal';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const offset      = Number(sp.get('offset')      ?? '0');
    const limit       = Number(sp.get('limit')        ?? '25');
    const countryCode = sp.get('countryCode')         || undefined;
    const search      = sp.get('search')              || undefined;

    const connector = createInternalConnector();

    const data = await connector.getRadios({
      offset,
      limit,
      countryCode,
      search,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('[GET /api/integrations/internal/radios]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
