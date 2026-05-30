// lib/integrations/internal/index.ts

import {
  listRadios,
  type ListRadiosParams,
  type ListRadiosResult,
} from '@/lib/services/radios';

export interface InternalConnectorConfig {
  // keep here in case you want per-tenant options later
}

export class InternalConnector {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: InternalConnectorConfig) {}

  // RADIO ----------------------------------------------------------------
  async getRadios(params: ListRadiosParams = {}): Promise<ListRadiosResult> {
    return listRadios(params);
  }

  // later you can add:
  // - getRadioLiveFeed (from your own events table)
  // - getRadioIdentifiers (your own platform map)
  // etc.
}

export function createInternalConnector(config?: InternalConnectorConfig) {
  return new InternalConnector(config);
}
