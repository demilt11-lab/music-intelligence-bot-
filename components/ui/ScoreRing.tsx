import React from 'react';

interface ScoreRingProps {
  score: number; // 0–1
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function ScoreRing({ score, size = 48, strokeWidth = 4, className = '', label }: ScoreRingProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, score)));

  const color =
    score >= 0.7 ? '#10b981' :
    score >= 0.4 ? '#f59e0b' :
    '#94a3b8';

  const bgColor =
    score >= 0.7 ? 'rgb(16 185 129 / 0.12)' :
    score >= 0.4 ? 'rgb(245 158 11 / 0.12)' :
    'rgb(148 163 184 / 0.08)';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, background: bgColor }}
      role="meter"
      aria-valuenow={Math.round(score * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Score: ${Math.round(score * 100)}`}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(30 41 59)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <span className="relative text-[11px] font-bold" style={{ color }}>
        {Math.round(score * 100)}
      </span>
    </div>
  );
}
