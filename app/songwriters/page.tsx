// app/songwriters/page.tsx
import { AppShell } from '../ui/components/layout/AppShell';
import { PageHeader } from '../ui/components/layout/PageHeader';
import SongwritersClient from './SongwritersClient';

export default function SongwritersPage() {
  return (
    <AppShell>
      <PageHeader
        title="Songwriters"
        subtitle="Search and explore songwriter catalogs."
      />
      <SongwritersClient />
    </AppShell>
  );
}
