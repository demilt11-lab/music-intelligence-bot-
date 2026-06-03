import SongwritersClient from './SongwritersClient';

export const metadata = {
  title: 'Songwriters',
  description: 'Search and explore songwriter catalogs.',
};

export default function SongwritersPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Songwriters</h1>
        <p className="text-sm text-slate-400 mt-1">Search and explore songwriter catalogs.</p>
      </div>
      <SongwritersClient />
    </div>
  );
}
