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
  // reserved for multi-tenant config later
}

export class InternalConnector {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: InternalConnectorConfig) {}

  async getRadios(params: ListRadiosParams = {}): Promise<ListRadiosResult> {
    return listRadios(params);
  }

  async getRadioLiveFeed(params: RadioLiveFeedParams): Promise<RadioLiveFeedResult> {
    return getRadioLiveFeed(params);
  }
}

export function createInternalConnector(config?: InternalConnectorConfig) {
  return new InternalConnector(config);
}
