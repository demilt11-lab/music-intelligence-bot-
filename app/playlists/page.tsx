// app/playlists/page.tsx
import { AppShell } from '../ui/components/layout/AppShell';
import { PageHeader } from '../ui/components/layout/PageHeader';
import PlaylistsClient from './PlaylistsClient';

export default function PlaylistsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Playlists"
        subtitle="Explore playlists and their impact on your catalog."
      />
      <PlaylistsClient />
    </AppShell>
  );
}
