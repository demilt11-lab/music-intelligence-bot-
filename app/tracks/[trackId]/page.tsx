import { ChartsClient } from './ChartsClient';
import { RadioClient } from './RadioClient';

async function getTrack(trackId: string) {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    '';

  try {
    const res = await fetch(`${baseUrl}/api/tracks/${trackId}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.obj;
  } catch {
    return null;
  }
}

type TrackPageProps = {
  params: Promise<{ trackId: string }>;
};

export default async function TrackPage({ params }: TrackPageProps) {
  const { trackId } = await params;
  const track = await getTrack(trackId);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">
          {track?.name ?? 'Track'}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {track
            ? track.artists?.map((a: { name: string }) => a.name).join(', ')
            : 'Track metadata'}
        </p>
      </div>

      {!track && (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-sm text-slate-400">
          Track not found.
        </div>
      )}

      {track && (
        <>
          {/* Core metadata */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Core Metadata</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'ISRC', value: track.isrc },
                { label: 'Release date', value: track.releaseDate },
                { label: 'Label', value: track.albumLabel },
                { label: 'Tier', value: track.trackTier },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className="text-slate-200 font-medium">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Platform stats */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Platform Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'Spotify popularity', value: track.statistics?.spotifyPopularity },
                { label: 'Spotify streams', value: track.statistics?.spotifyStreams },
                { label: 'TikTok videos', value: track.statistics?.tiktokVideoCount },
                { label: 'YouTube views', value: track.statistics?.youtubeViews },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className="text-slate-200 font-semibold tabular-nums">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>

          <ChartsClient trackId={trackId} />
          <RadioClient trackId={trackId} />
        </>
      )}
    </div>
  );
}
