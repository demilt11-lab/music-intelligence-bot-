// app/playlists/[playlistId]/page.tsx
import { AppShell } from '../../ui/components/layout/AppShell';
import { PageHeader } from '../../ui/components/layout/PageHeader';
import { PageSection } from '../../ui/components/layout/PageSection';
import { DataTable } from '../../ui/components/data/DataTable';

async function getPlaylist(playlistId: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    '';

  const res = await fetch(`${baseUrl}/api/playlists/${playlistId}`, {
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.obj;
}

type PlaylistPageProps = {
  params: Promise<{ playlistId: string }>;
};

export default async function PlaylistPage(props: PlaylistPageProps) {
  const params = await props.params;
  const playlist = await getPlaylist(params.playlistId);

  return (
    <AppShell>
      <PageHeader
        title={playlist?.name ?? 'Playlist'}
        subtitle={playlist?.curatorName}
      />

      {!playlist && (
        <PageSection>
          <p className="text-sm text-slate-300">
            Playlist not found.
          </p>
        </PageSection>
      )}

      {playlist && (
        <>
          <PageSection title="Tracks">
            <DataTable
              ariaLabel="Playlist tracks"
              columns={[
                { key: 'name', header: 'Track' },
                {
                  key: 'artists',
                  header: 'Artist',
                  render: (row: any) =>
                    row.artists?.map((a: any) => a.name).join(', ') || '—',
                },
                { key: 'isrc', header: 'ISRC' },
                { key: 'position', header: 'Position' },
              ]}
              rows={playlist.tracks ?? []}
            />
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
