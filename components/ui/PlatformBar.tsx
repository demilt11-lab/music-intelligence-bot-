import React from 'react';

interface PlatformBarProps {
  platform: 'tiktok' | 'spotify' | 'youtube' | 'instagram' | 'luminate' | 'shazam';
  value: string | number | null;
  secondaryValue?: string | null;
  maxValue?: number;
  className?: string;
}

const PLATFORM_CONFIG = {
  tiktok:    { label: 'TikTok',     color: 'rgb(252 211 77)', bg: 'rgb(252 211 77 / 0.08)',  icon: '♪' },
  spotify:   { label: 'Spotify',    color: 'rgb(34 197 94)',  bg: 'rgb(34 197 94 / 0.08)',   icon: '♫' },
  youtube:   { label: 'YouTube',    color: 'rgb(239 68 68)',  bg: 'rgb(239 68 68 / 0.08)',   icon: '▶' },
  instagram: { label: 'Instagram',  color: 'rgb(217 70 239)', bg: 'rgb(217 70 239 / 0.08)',  icon: '◈' },
  luminate:  { label: 'Luminate',   color: 'rgb(99 102 241)', bg: 'rgb(99 102 241 / 0.08)',  icon: '◉' },
  shazam:    { label: 'Shazam',     color: 'rgb(14 165 233)', bg: 'rgb(14 165 233 / 0.08)',  icon: '✦' },
} as const;

function formatValue(v: string | number | null): string {
  if (v == null || v === '' || v === '0' || v === 0) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function barWidth(v: string | number | null, max: number): number {
  const n = Number(v ?? 0);
  if (!n || !max) return 0;
  return Math.min(100, (Math.log10(n + 1) / Math.log10(max + 1)) * 100);
}

export function PlatformBar({ platform, value, secondaryValue, maxValue = 10_000_000, className = '' }: PlatformBarProps) {
  const cfg = PLATFORM_CONFIG[platform];
  const display = formatValue(value);
  const hasData = display !== '—';
  const width = hasData ? barWidth(value, maxValue) : 0;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Platform icon */}
      <span className="w-4 text-center text-[11px]" style={{ color: cfg.color }} aria-hidden>
        {cfg.icon}
      </span>
      {/* Label */}
      <span className="w-16 text-[11px] text-slate-500 shrink-0">{cfg.label}</span>
      {/* Bar */}
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, background: cfg.color, opacity: hasData ? 0.8 : 0 }}
          aria-hidden
        />
      </div>
      {/* Value */}
      <span className={`w-14 text-right text-[11px] font-mono tabular-nums ${hasData ? 'text-slate-300' : 'text-slate-600'}`}>
        {display}
      </span>
      {/* Secondary (velocity) */}
      {secondaryValue != null && secondaryValue !== '0' && (
        <span className={`text-[10px] font-medium w-10 text-right ${Number(secondaryValue) > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
          {Number(secondaryValue) > 0 ? '+' : ''}{Number(secondaryValue).toFixed(0)}%
        </span>
      )}
    </div>
  );
}
