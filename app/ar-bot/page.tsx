'use client'

import { PageShell } from '@/components/ui/PageShell'
import { ArBotChat } from '@/components/ar-bot/ArBotChat'

export default function ArBotPage() {
  return (
    <PageShell
      title="A&R Bot"
      description="Ask Buddy to search artists by heat/breakout score, explain a specific artist's scoring, or find playlist fits — backed by services/ar-api's predictive scoring."
    >
      <ArBotChat />
    </PageShell>
  )
}
