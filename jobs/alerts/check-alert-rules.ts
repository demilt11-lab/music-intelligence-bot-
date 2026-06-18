/**
 * Cron job: evaluate active alert rules and fire notifications.
 * Run: npx ts-node jobs/alerts/check-alert-rules.ts
 * Recommended schedule: every 30 minutes.
 */

import { PrismaClient } from '@prisma/client';
import { ScoutSources } from '../../lib/engine';
import { emptyTrack } from '../../lib/talentScout/emptyTrack';

const db = new PrismaClient();
const COOLDOWN_HOURS = 24;
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

function evaluate(value: number, operator: string, threshold: number): boolean {
  return operator === 'gt' ? value > threshold : operator === 'lt' ? value < threshold : false;
}

async function main() {
  console.log('[check-alert-rules] Starting...');
  const rules = await db.alertRule.findMany({ where: { isActive: true } });
  console.log(`[check-alert-rules] Evaluating ${rules.length} active rules`);

  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
  let fired = 0;

  for (const rule of rules) {
    if (rule.lastFiredAt && rule.lastFiredAt > cutoff) continue;

    const targets: Array<{ entityType: string; entityId: number }> =
      rule.entityType === 'watchlist'
        ? (await db.watchlistItem.findMany({ where: { tenantId: rule.tenantId } }) as Array<{ entityType: string; entityId: number }>).map((i) => ({
            entityType: i.entityType,
            entityId: i.entityId,
          }))
        : [{ entityType: rule.entityType as string, entityId: rule.entityId! as number }];

    for (const target of targets) {
      const value = await getMetricValue(target.entityType, target.entityId, rule.metric as MetricKey);
      if (value == null) continue;

      if (evaluate(value, rule.operator, rule.threshold)) {
        const msg = `Alert: ${target.entityType} ${target.entityId} — ${rule.metric} is ${value.toFixed(4)} (${rule.operator} ${rule.threshold})`;
        if (rule.channel === 'webhook') {
          await fetch(rule.destination, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: target.entityType, entityId: target.entityId, metric: rule.metric, value, threshold: rule.threshold, message: msg }),
          });
        } else {
          console.log(`[EMAIL] To: [redacted]\n${msg}`);
        }
        await db.alertRule.update({ where: { id: rule.id }, data: { lastFiredAt: new Date() } });
        fired++;
        break;
      }
    }
  }

  console.log(`[check-alert-rules] Done. Fired ${fired} alerts.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
