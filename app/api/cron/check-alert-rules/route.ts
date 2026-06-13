import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ScoutSources } from '@/lib/engine';
import { emptyTrack } from '@/lib/talentScout/emptyTrack';
import { verifyCronSecret } from '@/lib/platform/cron-auth';
import { validateWebhookUrl } from '@/lib/platform/webhook-url';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type MetricKey = 'viralScore' | 'breakProbability' | 'streams7dDelta';

async function getMetricValue(entityType: string, entityId: number, metric: MetricKey): Promise<number | null> {
  if (entityType === 'track' && metric === 'viralScore') {
    const [withMl] = await ScoutSources.hydrateMlSignals([emptyTrack(entityId)]);
    return withMl?.viralScore ?? null;
  }
  if (entityType === 'artist') {
    const snap = await db.artistTrajectorySnapshot.findFirst({
      where: { artistId: entityId },
      orderBy: { date: 'desc' },
    });
    if (metric === 'breakProbability') return snap?.breakProbability ?? null;
    if (metric === 'streams7dDelta') return snap?.streams7dDelta ?? null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const COOLDOWN_HOURS = 24;
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
  let fired = 0;

  const rules = await db.alertRule.findMany({ where: { isActive: true } });

  for (const rule of rules) {
    if (rule.lastFiredAt && rule.lastFiredAt > cutoff) continue;

    const targets: Array<{ entityType: string; entityId: number }> =
      rule.entityType === 'watchlist'
        ? (await db.watchlistItem.findMany({ where: { tenantId: rule.tenantId } }) as Array<{ entityType: string; entityId: number }>)
            .map((i) => ({ entityType: i.entityType, entityId: i.entityId }))
        : [{ entityType: rule.entityType, entityId: rule.entityId! }];

    for (const target of targets) {
      const value = await getMetricValue(target.entityType, target.entityId, rule.metric as MetricKey);
      if (value == null) continue;

      const triggered =
        rule.operator === 'gt' ? value > rule.threshold : value < rule.threshold;

      if (triggered) {
        const msg = `Alert: ${target.entityType} ${target.entityId} — ${rule.metric} is ${value.toFixed(4)} (${rule.operator} ${rule.threshold})`;
        if (rule.channel === 'webhook') {
          try {
            validateWebhookUrl(rule.destination);
          } catch (e: any) {
            console.warn(`[alert-rules] Skipping invalid webhook URL for rule ${rule.id}: ${e.message}`);
            continue;
          }
          await fetch(rule.destination, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entityType: target.entityType,
              entityId: target.entityId,
              metric: rule.metric,
              value,
              threshold: rule.threshold,
              message: msg,
            }),
          });
        }
        await db.alertRule.update({ where: { id: rule.id }, data: { lastFiredAt: new Date() } });
        fired++;
        break;
      }
    }
  }

  return NextResponse.json({ ok: true, fired, evaluated: rules.length });
}
