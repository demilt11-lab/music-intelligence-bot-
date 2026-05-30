// app/tracks/[trackId]/page.tsx
import { AppShell } from '../../ui/components/layout/AppShell';
import { PageHeader } from '../../ui/components/layout/PageHeader';
import { PageSection } from '../../ui/components/layout/PageSection';
import { StatGrid } from '../../ui/components/data/StatGrid';

async function getTrack(trackId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/tracks/${trackId}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.obj;
}

type TrackPageProps = {
  params: { trackId: string };
};

export default async function TrackPage({ params }: TrackPageProps) {
  const track = await getTrack(params.trackId);

  return (
    <AppShell>
      <PageHeader
        title={track?.name ?? 'Track'}
        subtitle={
          track
            ? track.artists?.map((a: any) => a.name).join(', ')
            : 'Track metadata'
        }
      />

      {!track && (
        <PageSection>
          <p className="text-sm text-slate-300">
            Track not found.
          </p>
        </PageSection>
      )}

      {track && (
        <>
          <PageSection title="Core metadata">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1 space-y-2 text-sm">
                <p>
                  <span className="text-slate-400">ISRC:</span>{' '}
                  <span className="text-slate-100">{track.isrc}</span>
                </p>
                <p>
                  <span className="text-slate-400">Release date:</span>{' '}
                  <span className="text-slate-100">
                    {track.releaseDate}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Label:</span>{' '}
                  <span className="text-slate-100">
                    {track.albumLabel}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Tier:</span>{' '}
                  <span className="text-slate-100">
                    {track.trackTier}
                  </span>
                </p>
              </div>
            </div>
          </PageSection>

          <PageSection title="Platform stats">
            <StatGrid
              items={[
                {
                  key: 'spotifyPopularity',
                  label: 'Spotify popularity',
                  value: track.statistics?.spotifyPopularity ?? '—',
                },
                {
                  key: 'spotifyStreams',
                  label: 'Spotify streams',
                  value: track.statistics?.spotifyStreams ?? '—',
                },
                {
                  key: 'tiktokVideoCount',
                  label: 'TikTok videos',
                  value: track.statistics?.tiktokVideoCount ?? '—',
                },
                {
                  key: 'youtubeViews',
                  label: 'YouTube views',
                  value: track.statistics?.youtubeViews ?? '—',
                },
              ]}
            />
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
