// app/api/luminate/sales/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ingestSalesForEntity } from '@/lib/luminate/ingest';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const entityType = (searchParams.get('entityType') ??
      'song') as 'song' | 'artist' | 'release_group';
    const entityId = Number(searchParams.get('entityId'));
    if (!entityId || Number.isNaN(entityId)) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    const since = searchParams.get('since') ?? '';
    const until = searchParams.get('until') ?? '';
    const locationId = searchParams.get('locationId') ?? undefined;
    const marketId = searchParams.get('marketId')
      ? Number(searchParams.get('marketId'))
      : undefined;

    const result = await ingestSalesForEntity({
      luminatePath: '/songs', // or /artists, /musical_release_groups
      params: {
        start_date: since,
        end_date: until,
        location_id: locationId,
      },
      entityType,
      entityId,
      locationId,
      marketId,
    });

    return NextResponse.json({ data: result });
  } catch (err: any) {
    logger.error('[luminate-sales]', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
