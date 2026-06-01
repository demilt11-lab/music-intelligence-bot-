'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn, clamp } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Props for the ViralScoreGauge component. */
export interface ViralScoreGaugeProps {
  /** Viral probability score, 0 to 1. */
  score: number;
  /** Diameter of the gauge in pixels. @default 72 */
  size?: number;
  /** Whether to show the percentage label. @default true */
  showLabel?: boolean;
  /** Whether to animate the arc on mount. @default true */
  animated?: boolean;
  /** Additional className for the root element. */
  className?: string;
}

// ─── Color thresholds ─────────────────────────────────────────────────────────

function getArcColor(score: number): { stroke: string; text: string; bg: string } {
  if (score > 0.7) return { stroke: '#f43f5e', text: 'text-rose-400', bg: '#f43f5e' };   // rose-500
  if (score > 0.4) return { stroke: '#f59e0b', text: 'text-amber-400', bg: '#f59e0b' };  // amber-500
  return { stroke: '#10b981', text: 'text-emerald-400', bg: '#10b981' };                  // emerald-500
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * SVG arc gauge showing viral probability (0–1).
 * Color-coded: emerald < 0.4, amber 0.4–0.7, rose > 0.7.
 * Animates the arc stroke on mount.
 */
export function ViralScoreGauge({
  score,
  size = 72,
  showLabel = true,
  animated = true,
  className,
}: ViralScoreGaugeProps) {
  const clamped = clamp(score, 0, 1);
  const colors = getArcColor(clamped);

  // Arc geometry: semi-circle (180°) gauge
  // Using a 240° sweep arc for richer visual
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 10) / 2; // 5px stroke padding each side
  const strokeWidth = size >= 80 ? 7 : size >= 48 ? 5 : 4;

  // 240° sweep: starts at 150° (bottom-left), ends at 30° (bottom-right)
  const startAngle = 150;
  const sweepAngle = 240;

  const circumference = (sweepAngle / 360) * 2 * Math.PI * radius;
  const offset = circumference - clamped * circumference;

  function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
    const start = polarToCartesian(cx, cy, r, startDeg);
    const end = polarToCartesian(cx, cy, r, startDeg + sweepDeg);
    const largeArc = sweepDeg > 180 ? 1 : 0;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  }

  const trackPath = arcPath(cx, cy, radius, startAngle, sweepAngle);
  const fillPath = arcPath(cx, cy, radius, startAngle, sweepAngle);

  // Animated stroke offset
  const [displayOffset, setDisplayOffset] = useState(animated ? circumference : offset);
  const animRef = useRef<ReturnType<typeof requestAnimationFrame>>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    if (!animated) {
      setDisplayOffset(offset);
      return;
    }

    const duration = 900;
    const startOffset = circumference;
    const endOffset = offset;

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(ts: number) {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOut(t);
      setDisplayOffset(startOffset + (endOffset - startOffset) * eased);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    }

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      startTimeRef.current = undefined;
    };
  }, [animated, offset, circumference]);

  const pct = Math.round(clamped * 100);
  const fontSize = size >= 72 ? (size >= 100 ? '1.25rem' : '1rem') : '0.75rem';
  const labelFontSize = size >= 72 ? '0.6rem' : '0.55rem';

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-1', className)}
      role="img"
      aria-label={`Viral score: ${pct}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={fillPath}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={displayOffset}
          style={{ transition: animated ? undefined : 'none' }}
        />

        {showLabel && (
          <>
            <text
              x={cx}
              y={cy + (strokeWidth > 5 ? 4 : 3)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={colors.stroke}
              fontWeight="700"
              style={{ fontSize, fontVariantNumeric: 'tabular-nums' }}
            >
              {pct}%
            </text>
          </>
        )}
      </svg>

      {showLabel && size >= 64 && (
        <span
          className="text-2xs font-medium text-slate-500 uppercase tracking-wide leading-none"
          style={{ fontSize: labelFontSize }}
        >
          viral
        </span>
      )}
    </div>
  );
}

ViralScoreGauge.displayName = 'ViralScoreGauge';

export default ViralScoreGauge;
