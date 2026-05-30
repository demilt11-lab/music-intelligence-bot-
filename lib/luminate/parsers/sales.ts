// lib/luminate/parsers/sales.ts

import {
  LuminateMetricsResponse,
  LuminateMetricNode,
  LuminateMetricValuePoint,
  SalesRecord,
} from '../types';

type SalesParserContext = {
  entityType: SalesRecord['entityType'];
  entityId: number;
  locationId?: string | null;
  marketId?: number | null;
};

export function parseSalesMetrics(
  resp: LuminateMetricsResponse,
  ctx: SalesParserContext,
): SalesRecord[] {
  const salesMetric = resp.metrics.find((m) => m.name === 'Sales') as
    | LuminateMetricNode
    | undefined;
  if (!salesMetric || !Array.isArray(salesMetric.value)) return [];

  const productSalesNode = (salesMetric.value as LuminateMetricNode[]).find(
    (n) => n.name === 'Product Sales',
  );
  if (!productSalesNode || !Array.isArray(productSalesNode.value)) return [];

  const productNodes = productSalesNode.value as LuminateMetricNode[];

  const totalNode = productNodes.find((n) => n.name === 'total');
  if (!totalNode || !Array.isArray(totalNode.value)) return [];

  const timeSeries = totalNode.value as LuminateMetricValuePoint[];

  return timeSeries.map((point) => ({
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    date: point.date,
    locationId: ctx.locationId ?? null,
    marketId: ctx.marketId ?? null,
    distributionChannel: null,
    purchaseMethod: null,
    storeStrata: null,
    productFormat: null,
    releaseType: null,
    units: String(point.value),
  }));
}
