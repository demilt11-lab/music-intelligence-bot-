// app/songwriters/[id]/catalog/page.tsx
import { AppShell } from '../../../ui/components/layout/AppShell';
import { PageHeader } from '../../../ui/components/layout/PageHeader';
import { PageSection } from '../../../ui/components/layout/PageSection';
import { DataTable } from '../../../ui/components/data/DataTable';

async function getSongwriterCatalog(id: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    '';

  const res = await fetch(
    `${baseUrl}/api/v1/songwriters/${id}/catalog`,
    { cache: 'no-store' },
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.obj;
}

type SongwriterCatalogPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SongwriterCatalogPage(props: SongwriterCatalogPageProps) {
  const params = await props.params;
  const catalog = await getSongwriterCatalog(params.id);

  return (
    <AppShell>
      <PageHeader
        title="Songwriter catalog"
        subtitle={`Songwriter ID: ${params.id}`}
      />

      {!catalog && (
        <PageSection>
          <p className="text-sm text-slate-300">
            Catalog not found.
          </p>
        </PageSection>
      )}

      {catalog && (
        <PageSection title="Tracks">
          <DataTable
            ariaLabel="Songwriter tracks"
            columns={[
              { key: 'name', header: 'Track' },
              {
                key: 'artists',
                header: 'Artist',
                render: (row: any) =>
                  row.artists?.map((a: any) => a.name).join(', ') || '—',
              },
              { key: 'isrc', header: 'ISRC' },
            ]}
            rows={catalog.tracks ?? []}
          />
        </PageSection>
      )}
    </AppShell>
  );
}
