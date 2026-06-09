'use client'

import React from 'react'
import { PageShell } from '@/components/ui/PageShell'
import { DailyTalentScout } from '@/components/talent-scout/DailyTalentScout'

export default function TalentScoutPage() {
  return (
    <PageShell
      title="Buddy A&R Scout"
      description="Your AI scouting desk for breakout artists, momentum shifts, playlist signals, and platform-by-platform music intelligence."
    >
      <DailyTalentScout />
    </PageShell>
  )
}
