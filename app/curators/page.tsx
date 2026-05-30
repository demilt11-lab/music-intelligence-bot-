// app/curators/page.tsx
import { AppShell } from '../ui/components/layout/AppShell';
import { PageHeader } from '../ui/components/layout/PageHeader';
import CuratorsClient from './CuratorsClient';

export default function CuratorsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Curators"
        subtitle="Discover curators and their playlists."
      />
      <CuratorsClient />
    </AppShell>
  );
}
