// lib/luminate/parsers/streams.ts

import {
  LuminateMetricsResponse,
  LuminateMetricNode,
  LuminateMetricValuePoint,
  StreamRecord,
} from '../types';

type StreamParserContext = {
  entityType: StreamRecord['entityType'];
  entityId: number;
  locationId?: string | null;
  marketId?: number | null;
  contentType?: StreamRecord['contentType'];
  commercialModel?: StreamRecord['commercialModel'];
  serviceType?: StreamRecord['serviceType'];
};

export function parseStreamsMetrics(
  resp: LuminateMetricsResponse,
  ctx: StreamParserContext,
): StreamRecord[] {
  const streamsMetric = resp.metrics.find((m) => m.name === 'Streams') as
    | LuminateMetricNode
    | undefined;

  if (!streamsMetric || !Array.isArray(streamsMetric.value)) return [];

  const values = streamsMetric.value as LuminateMetricNode[];

  const totalNode = values.find((v) => v.name === 'total');
  if (!totalNode || !Array.isArray(totalNode.value)) return [];

  const timeSeries = totalNode.value as LuminateMetricValuePoint[];

  return timeSeries.map((point) => ({
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    date: point.date,
    locationId: ctx.locationId ?? null,
    marketId: ctx.marketId ?? null,
    contentType: ctx.contentType ?? null,
    commercialModel: ctx.commercialModel ?? null,
    serviceType: ctx.serviceType ?? null,
    streams: String(point.value),
  }));
}
