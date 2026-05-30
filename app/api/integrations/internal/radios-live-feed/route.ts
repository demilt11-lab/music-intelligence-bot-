// app/api/integrations/internal/radios-live-feed/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createInternalConnector } from '@/lib/integrations/internal';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const radioSlug = sp.get('radioSlug');
    if (!radioSlug) {
      return NextResponse.json(
        { error: 'radioSlug is required' },
        { status: 400 },
      );
    }

    const startDate = sp.get('startDate') || undefined;
    const endDate   = sp.get('endDate')   || undefined;
    const offset    = Number(sp.get('offset') ?? '0');
    const limit     = Number(sp.get('limit')  ?? '100');

    const connector = createInternalConnector();

    const data = await connector.getRadioLiveFeed({
      radioSlug,
      startDate,
      endDate,
      offset,
      limit,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('[GET /api/integrations/internal/radios-live-feed]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
