// lib/integrations/internal/index.ts

import {
  listRadios,
  getRadioLiveFeed,
  type ListRadiosParams,
  type ListRadiosResult,
  type RadioLiveFeedParams,
  type RadioLiveFeedResult,
} from '@/lib/services/radios';

export interface InternalConnectorConfig {
  // For future multi-tenant or feature flags.
}

export class InternalConnector {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: InternalConnectorConfig) {}

  // RADIO LIST
  async getRadios(params: ListRadiosParams = {}): Promise<ListRadiosResult> {
    return listRadios(params);
  }

  // RADIO LIVE FEED
  async getRadioLiveFeed(params: RadioLiveFeedParams): Promise<RadioLiveFeedResult> {
    return getRadioLiveFeed(params);
  }
}

export function createInternalConnector(config?: InternalConnectorConfig) {
  return new InternalConnector(config);
}
