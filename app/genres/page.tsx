'use client';

import React from 'react';
import { PageShell } from '@/components/ui/PageShell';
import { GenreBreakoutTable } from '@/components/genres/GenreBreakoutTable';

export default function GenresPage() {
  return (
    <PageShell
      title="Genre Breakout Radar"
      description="See which genres are heating up internationally and in the US, based on UGC, playlists, and radio."
    >
      <GenreBreakoutTable />
    </PageShell>
  );
}
