/**
 * Cron job: send daily A&R digest to all active subscribers.
 * Run via: npx ts-node jobs/digest/send-daily-digest.ts
 * Recommended schedule: 06:00 UTC daily.
 */

import { PrismaClient } from '@prisma/client';
import { assembleDigest } from '../../lib/digest/assembler';

const db = new PrismaClient();

async function deliverWebhook(url: string, payload: object) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function deliverEmail(email: string, payload: { headline: string; breakoutTracks: any[]; breakingArtists: any[]; watchlistAlerts: any[] }) {
  // SMTP delivery placeholder — wire to nodemailer / Resend / SendGrid here
  console.log(`[EMAIL] queued`);
  console.log(`  Subject: ${payload.headline}`);
  console.log(`  ${payload.breakoutTracks.length} breakout tracks, ${payload.breakingArtists.length} breaking artists, ${payload.watchlistAlerts.length} watchlist alerts`);
}

async function main() {
  console.log('[send-daily-digest] Starting...');

  const today = new Date().toISOString().slice(0, 10);
  const subs = await db.digestSubscription.findMany({
    where: { isActive: true, frequency: 'daily' },
    include: { tenant: true },
  });

  console.log(`[send-daily-digest] ${subs.length} active daily subscribers`);

  for (const sub of subs) {
    try {
      const payload = await assembleDigest(sub.tenantId, sub.tenant.name, today);

      if (sub.webhookUrl) await deliverWebhook(sub.webhookUrl, payload);
      if (sub.email) await deliverEmail(sub.email, payload);

      await db.digestSubscription.update({
        where: { id: sub.id },
        data: { lastSentAt: new Date() },
      });

      console.log(`  ✓ Sent to tenant ${sub.tenantId} (${sub.tenant.name})`);
    } catch (e) {
      console.error(`  ✗ Failed for tenant ${sub.tenantId}:`, e);
    }
  }

  console.log('[send-daily-digest] Done.');
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
