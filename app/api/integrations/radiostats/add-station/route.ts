// app/api/integrations/radiostats/add-station/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  addRadiostatsStation,
  AddStationRequest,
} from '@/lib/radiostats/addStation';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as Partial<AddStationRequest>;

    const {
      country_code,
      name,
      radio_type,
      website,
      city_name,
      comment,
      contact,
      frequency,
      stream_url,
    } = body;

    if (!country_code || !name || !radio_type || !website) {
      return NextResponse.json(
        {
          error:
            'country_code, name, radio_type, and website are required fields',
        },
        { status: 400 },
      );
    }

    const resp = await addRadiostatsStation({
      country_code,
      name,
      radio_type,
      website,
      city_name,
      comment,
      contact,
      frequency,
      stream_url,
    });

    return NextResponse.json(resp, { status: 200 });
  } catch (err: any) {
    logger.error('Radiostats add-station error', err);
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status },
    );
  }
}
