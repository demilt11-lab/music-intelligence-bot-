import React from 'react';

interface CompanionMessageProps {
  message: string;
  type?: 'insight' | 'action' | 'warning' | 'info';
  compact?: boolean;
  className?: string;
}

const TYPE_CONFIG = {
  insight: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5',  text: 'text-emerald-300', dot: 'bg-emerald-500', icon: '◎' },
  action:  { border: 'border-violet-500/20',  bg: 'bg-violet-500/5',   text: 'text-violet-300',  dot: 'bg-violet-500',  icon: '▸' },
  warning: { border: 'border-amber-500/20',   bg: 'bg-amber-500/5',    text: 'text-amber-300',   dot: 'bg-amber-500',   icon: '⚡' },
  info:    { border: 'border-slate-600/40',   bg: 'bg-slate-800/40',   text: 'text-slate-400',   dot: 'bg-slate-500',   icon: '·' },
};

export function CompanionMessage({ message, type = 'info', compact = false, className = '' }: CompanionMessageProps) {
  const cfg = TYPE_CONFIG[type];

  if (compact) {
    return (
      <p className={`text-[11px] ${cfg.text} leading-relaxed ${className}`}>
        <span className="mr-1" aria-hidden>{cfg.icon}</span>
        {message}
      </p>
    );
  }

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2 ${className}`} role="note">
      <div className="flex gap-2">
        <span className={`mt-0.5 text-xs shrink-0 ${cfg.text}`} aria-hidden>{cfg.icon}</span>
        <p className={`text-xs leading-relaxed ${cfg.text}`}>{message}</p>
      </div>
    </div>
  );
}
