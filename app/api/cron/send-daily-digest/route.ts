import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assembleDigest } from '@/lib/digest/assembler';

function verifyCronSecret(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const subs = await db.digestSubscription.findMany({
    where: { isActive: true, frequency: 'daily' },
    include: { tenant: true },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      const payload = await assembleDigest(sub.tenantId, (sub as any).tenant.name, today);

      if (sub.webhookUrl) {
        await fetch(sub.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      await db.digestSubscription.update({
        where: { id: sub.id },
        data: { lastSentAt: new Date() },
      });
      sent++;
    } catch (e: any) {
      errors.push(`tenant:${sub.tenantId} — ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
