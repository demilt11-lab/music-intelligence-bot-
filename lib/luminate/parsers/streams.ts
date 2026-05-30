// lib/luminate/parsers/streams.ts

import {
  LuminateMetricsResponse,
  LuminateMetricNode,
  LuminateDimensionCategory,
  LuminateMetricValuePoint,
  StreamRecord,
} from '../types';

type StreamParserContext = {
  entityType: StreamRecord['entityType'];
  entityId: number;
  locationId?: string | null;
  marketId?: number | null;
  // optional: injected from query
  contentType?: StreamRecord['contentType'];
  commercialModel?: StreamRecord['commercialModel'];
  serviceType?: StreamRecord['serviceType'];
};

/**
 * Parse a Luminate "Streams" metrics payload into normalized StreamRecord[]
 * Handles:
 *  - metrics[].name === "Streams"
 *  - value[].name === "total" -> primary time series (date, value)
 *  - dimension nodes: commercial_model, content_type, service_type
 */
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

  // optional dimension categories
  const commercialNode = values.find((v) => v.name === 'commercial_model');
  const contentTypeNode = values.find((v) => v.name === 'content_type');
  const serviceTypeNode = values.find((v) => v.name === 'service_type');

  const commercialCategories = (commercialNode?.value ??
    []) as LuminateDimensionCategory[];
  const contentTypeCategories = (contentTypeNode?.value ??
    []) as LuminateDimensionCategory[];
  const serviceTypeCategories = (serviceTypeNode?.value ??
    []) as LuminateDimensionCategory[];

  // For now, we just attach the query-level filters (ctx.*) and not explode per-category.
  return timeSeries.map((point) => {
    return {
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      date: point.date,
      locationId: ctx.locationId ?? null,
      marketId: ctx.marketId ?? null,
      contentType: ctx.contentType ?? null,
      commercialModel: ctx.commercialModel ?? null,
      serviceType: ctx.serviceType ?? null,
      streams: String(point.value),
    };
  });
}
