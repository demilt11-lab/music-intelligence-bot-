// lib/luminate/parsers/airplay.ts

import {
  AirplayRecord,
  LuminateMetricsResponse,
  LuminateMetricNode,
  LuminateMetricValuePoint,
} from '../types';

type AirplayParserContext = {
  entityType: AirplayRecord['entityType'];
  entityId: number;
  locationId?: string | null;
  marketId?: number | null;
  formatId?: string | null;
};

export function parseAirplayMetrics(
  resp: LuminateMetricsResponse,
  ctx: AirplayParserContext,
): AirplayRecord[] {
  const airplayMetric = resp.metrics.find((m) => m.name === 'Airplay') as
    | LuminateMetricNode
    | undefined;

  if (!airplayMetric || !Array.isArray(airplayMetric.value)) return [];

  const nodes = airplayMetric.value as LuminateMetricNode[];

  const audienceNode = nodes.find((n) => n.name === 'Audience');
  const spinsNode = nodes.find((n) => n.name === 'Spins');

  const audienceTotal = audienceNode?.value?.find(
    (n: LuminateMetricNode) => n.name === 'total',
  );
  const spinsTotal = spinsNode?.value?.find(
    (n: LuminateMetricNode) => n.name === 'total',
  );

  const audienceSeries = (audienceTotal?.value ??
    []) as LuminateMetricValuePoint[];
  const spinsSeries = (spinsTotal?.value ?? []) as LuminateMetricValuePoint[];

  const byDate = new Map<
    string,
    { audience?: string | null; spins?: string | null }
  >();

  for (const pt of audienceSeries) {
    const existing = byDate.get(pt.date) ?? {};
    existing.audience = String(pt.value);
    byDate.set(pt.date, existing);
  }

  for (const pt of spinsSeries) {
    const existing = byDate.get(pt.date) ?? {};
    existing.spins = String(pt.value);
    byDate.set(pt.date, existing);
  }

  const records: AirplayRecord[] = [];
  for (const [date, vals] of byDate.entries()) {
    records.push({
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      date,
      locationId: ctx.locationId ?? null,
      marketId: ctx.marketId ?? null,
      formatId: ctx.formatId ?? null,
      audience: vals.audience ?? null,
      spins: vals.spins ?? null,
    });
  }

  return records;
}
