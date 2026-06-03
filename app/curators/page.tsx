import CuratorsClient from './CuratorsClient';

export const metadata = {
  title: 'Curators',
  description: 'Discover curators and their playlists.',
};

export default function CuratorsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Curators</h1>
        <p className="text-sm text-slate-400 mt-1">Discover curators and their playlists.</p>
      </div>
      <CuratorsClient />
    </div>
  );
}
