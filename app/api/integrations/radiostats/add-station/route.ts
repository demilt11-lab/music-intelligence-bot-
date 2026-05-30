// app/api/integrations/radiostats/add-station/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { addRadiostatsStation } from '@/lib/radiostats/addStation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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
    console.error('Radiostats add-station integration error', err);
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status },
    );
  }
}
