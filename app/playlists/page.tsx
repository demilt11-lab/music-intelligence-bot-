import PlaylistsClient from './PlaylistsClient';

export const metadata = {
  title: 'Playlists',
  description: 'Explore playlists and their impact on your catalog.',
};

export default function PlaylistsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Playlists</h1>
        <p className="text-sm text-slate-400 mt-1">Explore playlists and their impact on your catalog.</p>
      </div>
      <PlaylistsClient />
    </div>
  );
}
