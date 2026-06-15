'use client'

import React from 'react'
import { PageShell } from '@/components/ui/PageShell'
import { WriterProducerSearch } from '@/components/writers-producers/WriterProducerSearch'

export default function WritersProducersPage() {
  return (
    <PageShell
      title="Writers & Producers"
      description="Discover rising songwriters and producers globally. Search playlists across Spotify, YouTube, SoundCloud and music blogs, then see playlist placements and chart positions for their collaborations. AI/ML flags unsigned rising talent before the market does."
    >
      <WriterProducerSearch />
    </PageShell>
  )
}
