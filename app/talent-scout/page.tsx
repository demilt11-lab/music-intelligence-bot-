// app/talent-scout/page.tsx
'use client';

import React from 'react';
import { PageShell } from '@/components/ui/PageShell';
import { DailyTalentScout } from '@/components/talent-scout/DailyTalentScout';

export default function TalentScoutPage() {
  return (
    <PageShell
      title="Daily Talent Scout"
      description="UGC-first radar for emerging records. Updated daily using internal data, Luminate, and NOV8TE's scout engine."
    >
      <DailyTalentScout />
    </PageShell>
  );
}
