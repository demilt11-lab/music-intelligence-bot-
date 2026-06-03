'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type BreakingArtist = {
  artistId: string;
  name: string | null;
  code2: string | null;
  primaryGenre: string | null;
  primaryCode2: string | null;
  status: string;
  statusScore: number;
  breakProbability: number | null;
  streams28dDelta: number;
  playlistsDelta28d: number | null;
  followersDelta28d: number | null;
};

type BreakingResponse = { obj: BreakingArtist[]; offset: number; total: number };

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  ABOUT_TO_BREAK: { label: 'About to break', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
  GROWING:        { label: 'Growing',         badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  STABLE:         { label: 'Stable',          badge: 'bg-slate-700/40 text-slate-400 border-slate-700/30', dot: 'bg-slate-400' },
  DECLINING:      { label: 'Declining',       badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400' },
};

const FILTER_STATUSES = ['ABOUT_TO_BREAK', 'GROWING', 'STABLE', 'DECLINING'];

function fmt(v: number | null | undefined) {
  if (v == null) return '—';
  const pct = (v * 100).toFixed(1);
  return `${v > 0 ? '+' : ''}${pct}%`;
}

function fmtProb(v: number | null) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export default function ArtistsDashboardPage() {
  const [status, setStatus] = useState('ABOUT_TO_BREAK');
  const [genre, setGenre] = useState('');
  const [code2, setCode2] = useState('');
  const [data, setData] = useState<BreakingArtist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (genre) params.set('genre', genre);
    if (code2) params.set('code2', code2);
    params.set('limit', '100');
    fetch(`/api/artists/breaking?${params}`)
      .then((r) => (r.ok ? r.json() : { obj: [], total: 0 }))
      .then((json: BreakingResponse) => { setData(json.obj); setTotal(json.total); })
      .finally(() => setLoading(false));
  }, [status, genre, code2]);

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.STABLE;

  return (
    <div className="flex flex-col h-full">
      {/* Companion header */}
      <div className="border-b border-slate-800/60 bg-[#020817]/80 backdrop-blur-sm sticky top-0 z-10 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/10 border border-violet-500/25 flex items-center justify-center">
              <span className="text-violet-400 text-base" aria-hidden>◈</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#020817]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-violet-400">Artist Radar</span>
              {!loading && <span className="text-[10px] text-slate-600 font-mono">{total} results</span>}
            </div>
            <p className="text-sm text-slate-300">
              {loading
                ? 'Scanning artist trajectories…'
                : total === 0
                  ? "No artists match those filters — try broadening your search."
                  : `Tracking ${total} artist${total !== 1 ? 's' : ''} ${cfg.label.toLowerCase()}. ${status === 'ABOUT_TO_BREAK' ? 'These are your highest-priority targets.' : 'Updated daily from streaming and social signals.'}`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-800/40">
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
            {FILTER_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 font-medium transition-colors ${status === s ? 'bg-slate-700/60 text-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
                aria-pressed={status === s}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
          <input
            className="text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/40 w-32"
            placeholder="Genre…"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            aria-label="Filter by genre"
          />
          <input
            className="text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/40 w-24"
            placeholder="Region…"
            value={code2}
            onChange={(e) => setCode2(e.target.value.toUpperCase())}
            aria-label="Filter by region"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-800/40 shimmer" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <span className="text-4xl text-slate-700" aria-hidden>◈</span>
            <p className="text-slate-400 text-sm">No artists found for these filters.</p>
            <button onClick={() => { setGenre(''); setCode2(''); }} className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-900/40">
                  {['Artist', 'Status', 'Genre', 'Region', 'Break %', 'Streams 28d', 'Playlists 28d', 'Followers 28d'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium ${i >= 4 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {data.map((row) => {
                  const sc = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.STABLE;
                  return (
                    <tr key={row.artistId} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        {row.artistId ? (
                          <Link href={`/artists/${row.artistId}`} className="font-medium text-slate-200 hover:text-emerald-400 transition-colors">
                            {row.name || row.artistId}
                          </Link>
                        ) : (
                          <span className="text-slate-400">{row.name || 'Unknown'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sc.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{row.primaryGenre || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{row.primaryCode2 || row.code2 || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{fmtProb(row.breakProbability)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${row.streams28dDelta > 0 ? 'text-emerald-400' : row.streams28dDelta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {fmt(row.streams28dDelta)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${(row.playlistsDelta28d ?? 0) > 0 ? 'text-emerald-400' : (row.playlistsDelta28d ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {fmt(row.playlistsDelta28d)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${(row.followersDelta28d ?? 0) > 0 ? 'text-emerald-400' : (row.followersDelta28d ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {fmt(row.followersDelta28d)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
