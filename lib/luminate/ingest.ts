// lib/luminate/ingest.ts

import { PrismaClient } from '@prisma/client';
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

const db = new PrismaClient();

async function saveStreams(records: StreamRecord[]) {
  if (!records.length) return;
  await db.luminateStream.createMany({
    data: records.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      date: new Date(r.date),
      locationId: r.locationId,
      marketId: r.marketId,
      contentType: r.contentType,
      commercialModel: r.commercialModel,
      serviceType: r.serviceType,
      streams: r.streams,
    })),
    skipDuplicates: true,
  });
}

async function saveSales(records: SalesRecord[]) {
  if (!records.length) return;
  await db.luminateSales.createMany({
    data: records.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      date: new Date(r.date),
      locationId: r.locationId,
      marketId: r.marketId,
      distributionChannel: r.distributionChannel,
      purchaseMethod: r.purchaseMethod,
      storeStrata: r.storeStrata,
      productFormat: r.productFormat,
      releaseType: r.releaseType,
      units: r.units,
    })),
    skipDuplicates: true,
  });
}

async function saveAirplay(records: AirplayRecord[]) {
  if (!records.length) return;
  await db.luminateAirplay.createMany({
    data: records.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      date: new Date(r.date),
      locationId: r.locationId,
      marketId: r.marketId,
      formatId: r.formatId,
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
