// app/search/page.tsx
import { AppShell } from '../ui/components/layout/AppShell';
import { PageHeader } from '../ui/components/layout/PageHeader';
import SearchClient from './SearchClient';

export default function SearchPage() {
  return (
    <AppShell>
      <PageHeader
        title="Search"
        subtitle="Search across artists, tracks, playlists, curators, radio, and more."
      />
      <SearchClient />
    </AppShell>
  );
}
