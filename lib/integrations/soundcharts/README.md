# Soundcharts Connector

Thin wrapper around the Soundcharts API using the patterns from their docs:
- radio discovery + live feed + identifiers
- publisher resolution (IPI, platform ID) + identifiers
- song exposure (charts, playlists, radio) and audience series
- chart registry + TikTok music links weekly ranking

Auth headers:
- `X-App-Id`
- `X-API-Key`

## Usage

```ts
import { createSoundchartsConnector } from '@/lib/integrations/soundcharts';

const soundcharts = createSoundchartsConnector({
  appId: process.env.SOUNDCHARTS_APP_ID!,
  apiKey: process.env.SOUNDCHARTS_API_KEY!,
});

const radios = await soundcharts.getRadios({ limit: 25, offset: 0 });
const publisher = await soundcharts.getPublisherByIpi('00832425062');
const chartEntries = await soundcharts.getSongChartEntries('song-uuid', 'deezer');
```
