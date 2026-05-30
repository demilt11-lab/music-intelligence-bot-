// lib/luminate/ingest.ts

import { db } from '../db'; // adjust path to your db helper
import {
  AirplayRecord,
  SalesRecord,
  StreamRecord,
  LuminateMetricsResponse,
} from './types';
import {
  fetchLuminateStreams,
  fetchLuminateSales,
  fetchLuminateAirplay,
  LuminateQueryParams,
} from './client';
import { parseStreamsMetrics } from './parsers/streams';
import { parseSalesMetrics } from './parsers/sales';
import { parseAirplayMetrics } from './parsers/airplay';

/**
 * Insert or upsert StreamRecord[] into your DB.
 * You’ll need to align this with your Prisma schema
 * (e.g. track_platform_stats_daily or a new table).
 */
async function saveStreams(records: StreamRecord[]) {
  if (!records.length) return;
  // Example: insert into a dedicated luminate_streams table
  await db.luminate_streams.createMany({
    data: records.map((r) => ({
      entity_type: r.entityType,
      entity_id: r.entityId,
      date: new Date(r.date),
      location_id: r.locationId,
      market_id: r.marketId,
      content_type: r.contentType,
      commercial_model: r.commercialModel,
      service_type: r.serviceType,
      streams: r.streams,
    })),
    skipDuplicates: true,
  });
}

async function saveSales(records: SalesRecord[]) {
  if (!records.length) return;
  await db.luminate_sales.createMany({
    data: records.map((r) => ({
      entity_type: r.entityType,
      entity_id: r.entityId,
      date: new Date(r.date),
      location_id: r.locationId,
      market_id: r.marketId,
      distribution_channel: r.distributionChannel,
      purchase_method: r.purchaseMethod,
      store_strata: r.storeStrata,
      product_format: r.productFormat,
      release_type: r.releaseType,
      units: r.units,
    })),
    skipDuplicates: true,
  });
}

async function saveAirplay(records: AirplayRecord[]) {
  if (!records.length) return;
  await db.luminate_airplay.createMany({
    data: records.map((r) => ({
      entity_type: r.entityType,
      entity_id: r.entityId,
      date: new Date(r.date),
      location_id: r.locationId,
      market_id: r.marketId,
      format_id: r.formatId,
      audience: r.audience,
      spins: r.spins,
    })),
    skipDuplicates: true,
  });
}

export async function ingestStreamsForEntity(options: {
  luminatePath: string;
  params: LuminateQueryParams;
  entityType: StreamRecord['entityType'];
  entityId: number;
  locationId?: string;
  marketId?: number;
  contentType?: StreamRecord['contentType'];
  commercialModel?: StreamRecord['commercialModel'];
  serviceType?: StreamRecord['serviceType'];
}) {
  const resp = await fetchLuminateStreams(options.luminatePath, options.params);
  const records = parseStreamsMetrics(resp as LuminateMetricsResponse, {
    entityType: options.entityType,
    entityId: options.entityId,
    locationId: options.locationId,
    marketId: options.marketId,
    contentType: options.contentType,
    commercialModel: options.commercialModel,
    serviceType: options.serviceType,
  });
  await saveStreams(records);
  return records;
}

export async function ingestSalesForEntity(options: {
  luminatePath: string;
  params: LuminateQueryParams;
  entityType: SalesRecord['entityType'];
  entityId: number;
  locationId?: string;
  marketId?: number;
}) {
  const resp = await fetchLuminateSales(options.luminatePath, options.params);
  const records = parseSalesMetrics(resp as LuminateMetricsResponse, {
    entityType: options.entityType,
    entityId: options.entityId,
    locationId: options.locationId,
    marketId: options.marketId,
  });
  await saveSales(records);
  return records;
}

export async function ingestAirplayForEntity(options: {
  luminatePath: string;
  params: LuminateQueryParams;
  entityType: AirplayRecord['entityType'];
  entityId: number;
  locationId?: string;
  marketId?: number;
  formatId?: string;
}) {
  const resp = await fetchLuminateAirplay(options.luminatePath, options.params);
  const records = parseAirplayMetrics(resp as LuminateMetricsResponse, {
    entityType: options.entityType,
    entityId: options.entityId,
    locationId: options.locationId,
    marketId: options.marketId,
    formatId: options.formatId,
  });
  await saveAirplay(records);
  return records;
}
