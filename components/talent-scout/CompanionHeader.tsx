'use client';

import React from 'react';

interface CompanionHeaderProps {
  trackCount: number;
  hotCount: number;
  mode: string;
  code2: string;
  onModeChange: (m: 'ugc_early' | 'general') => void;
  onMarketChange: (m: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

function buildMessage(trackCount: number, hotCount: number, code2: string): string {
  if (trackCount === 0) return "I'm scanning for breakout tracks right now — check back in a moment.";
  const market = code2 === 'GLOBAL' ? 'globally' : `in ${code2}`;
  if (hotCount > 0) return `I found ${trackCount} tracks worth watching ${market}. ${hotCount} ${hotCount === 1 ? 'is' : 'are'} showing strong breakout signals right now.`;
  return `Monitoring ${trackCount} tracks ${market}. No major breakouts yet, but I'll flag them the moment I see momentum.`;
}

export function CompanionHeader({
  trackCount, hotCount, mode, code2,
  onModeChange, onMarketChange, onRefresh, isLoading,
}: CompanionHeaderProps) {
  const message = buildMessage(trackCount, hotCount, code2);

  return (
    <div className="border-b border-slate-800/60 bg-[#020817]/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="px-6 py-4 space-y-3">
        {/* Companion identity row */}
        <div className="flex items-start gap-3">
          {/* Animated avatar */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-violet-500/10 border border-emerald-500/25 flex items-center justify-center">
              <span className="text-emerald-400 text-base" aria-hidden>◎</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#020817]" aria-label="Online" />
          </div>

          {/* Message */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-emerald-400">A&R Scout</span>
              <span className="text-[10px] text-slate-600 font-mono">
                {isLoading ? 'scanning…' : `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Refresh data"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5" role="group" aria-label="Filter controls">
          <span className="text-[11px] text-slate-600 uppercase tracking-wider font-medium shrink-0">View</span>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
            {(['ugc_early', 'general'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
                aria-pressed={mode === m}
              >
                {m === 'ugc_early' ? 'Early UGC' : 'General'}
              </button>
            ))}
          </div>

          {/* Market select */}
          <select
            value={code2}
            onChange={(e) => onMarketChange(e.target.value)}
            className="text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
            aria-label="Select market"
          >
            <option value="US">🇺🇸 United States</option>
            <option value="GB">🇬🇧 United Kingdom</option>
            <option value="GLOBAL">🌍 Global</option>
            <option value="AU">🇦🇺 Australia</option>
            <option value="CA">🇨🇦 Canada</option>
            <option value="DE">🇩🇪 Germany</option>
            <option value="FR">🇫🇷 France</option>
            <option value="BR">🇧🇷 Brazil</option>
          </select>

          {/* Stats pills */}
          {trackCount > 0 && (
            <div className="flex gap-1.5 ml-auto">
              <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800/60 text-slate-400 border border-slate-700/50">
                {trackCount} tracks
              </span>
              {hotCount > 0 && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {hotCount} breaking
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
