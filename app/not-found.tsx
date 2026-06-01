import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-6xl font-bold text-slate-700">404</p>
        <h1 className="text-lg font-semibold text-slate-100">Page not found</h1>
        <p className="text-sm text-slate-400">
          This page doesn&apos;t exist or you may not have access.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
