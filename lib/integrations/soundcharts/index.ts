// lib/integrations/soundcharts/index.ts

import { SoundchartsClient, SoundchartsClientConfig } from './client';
import { SoundchartsConnector } from './connector';

export * from './client';
export * from './routes';
export * from './connector';
export * from './schema-notes';

export function createSoundchartsConnector(config: SoundchartsClientConfig) {
  const client = new SoundchartsClient(config);
  return new SoundchartsConnector(client);
}
