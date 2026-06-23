import SongwritersClient from './SongwritersClient';

export const metadata = {
  title: 'Songwriters',
  description: 'Search and explore songwriter catalogs.',
};

export default function SongwritersPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Songwriters</h1>
        <p className="text-sm text-slate-400 mt-1">Search and explore songwriter catalogs.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          How to search
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-300">
          <li>
            <span className="text-slate-100">What you can search:</span> a songwriter or
            composer&apos;s name — full or partial (e.g. &quot;Max Martin&quot; or just &quot;Martin&quot;).
          </li>
          <li>
            <span className="text-slate-100">What results mean:</span> each match shows the
            songwriter and how many tracks are in their catalog. Select one to open the full catalog.
          </li>
          <li>
            <span className="text-slate-100">No results?</span> Check spelling, try the last name
            only, or search by a co-writer. Catalogs depend on ingested publishing data.
          </li>
        </ul>
      </div>

      <SongwritersClient />
    </div>
  );
}
