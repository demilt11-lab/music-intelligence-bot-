// app/curators/[curatorId]/page.tsx
import { AppShell } from '../../ui/components/layout/AppShell';
import { PageHeader } from '../../ui/components/layout/PageHeader';
import { PageSection } from '../../ui/components/layout/PageSection';
import { DataTable } from '../../ui/components/data/DataTable';

async function getCurator(curatorId: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    '';
  const res = await fetch(`${baseUrl}/api/curators/${curatorId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.obj;
}

type CuratorPageProps = {
  params: { curatorId: string };
};

export default async function CuratorPage({
  params,
}: CuratorPageProps) {
  const curator = await getCurator(params.curatorId);

  return (
    <AppShell>
      <PageHeader
        title={curator?.name ?? 'Curator'}
        subtitle={curator?.platform}
      />

      {!curator && (
        <PageSection>
          <p className="text-sm text-slate-300">
            Curator not found.
          </p>
        </PageSection>
      )}

      {curator && (
        <>
          <PageSection title="Playlists">
            <DataTable
              ariaLabel="Curator playlists"
              columns={[
                { key: 'name', header: 'Playlist' },
                { key: 'platform', header: 'Platform' },
                {
                  key: 'trackCount',
                  header: 'Tracks',
                },
              ]}
              rows={curator.playlists ?? []}
            />
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
