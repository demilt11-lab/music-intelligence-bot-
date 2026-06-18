// app/api/luminate/streams/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ingestStreamsForEntity } from '@/lib/luminate/ingest';
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
    const contentType = (searchParams.get('contentType') as
      | 'audio'
      | 'video'
      | null) ?? null;
    const commercialModel = (searchParams.get('commercialModel') as
      | 'premium'
      | 'ad_supported'
      | null) ?? null;
    const serviceType = (searchParams.get('serviceType') as
      | 'on_demand'
      | 'programmed'
      | null) ?? null;

    const result = await ingestStreamsForEntity({
      luminatePath: '/songs', // adjust based on entityType if needed
      params: {
        start_date: since,
        end_date: until,
        location_id: locationId,
        content_type: contentType ?? undefined,
        commercial_model: commercialModel ?? undefined,
        service_type: serviceType ?? undefined,
      },
      entityType,
      entityId,
      locationId,
      marketId,
      contentType,
      commercialModel,
      serviceType,
    });

    return NextResponse.json({ data: result });
  } catch (err: any) {
    logger.error('[luminate-streams]', err);
    return NextResponse.json(
      { error: err.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
