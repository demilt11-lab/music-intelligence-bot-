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

}
