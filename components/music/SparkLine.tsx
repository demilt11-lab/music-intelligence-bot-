'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Props for the SparkLine component. */
export interface SparkLineProps {
  /** Array of data point values. */
  data: number[];
  /** SVG width in pixels. @default 80 */
  width?: number;
  /** SVG height in pixels. @default 28 */
  height?: number;
  /** Stroke color (Tailwind-compatible CSS color). @default "#10b981" (emerald-500) */
  color?: string;
  /** Whether to show a dot at the latest (rightmost) data point. @default true */
  showDot?: boolean;
  /** Stroke width. @default 1.5 */
  strokeWidth?: number;
  /** Whether to fill area under the line. @default false */
  filled?: boolean;
  /** Additional className for the SVG element. */
  className?: string;
  /** Accessible label. */
  'aria-label'?: string;
}

// ─── Pure SVG path math ───────────────────────────────────────────────────────

function buildPath(
  data: number[],
  width: number,
  height: number,
  padding: number,
): { linePath: string; fillPath: string; lastX: number; lastY: number } {
  if (data.length < 2) {
    const x = width / 2;
    const y = height / 2;
    return { linePath: `M ${x} ${y}`, fillPath: '', lastX: x, lastY: y };
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  function px(i: number) {
    return padding + (i / (data.length - 1)) * plotW;
  }

  function py(v: number) {
    return padding + (1 - (v - min) / range) * plotH;
  }

  // Smooth catmull-rom-ish path using cubic bezier control points
  const points = data.map((v, i) => ({ x: px(i), y: py(v) }));

  let linePath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    linePath += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  const last = points[points.length - 1];
  const fillPath = `${linePath} L ${last.x.toFixed(2)} ${(height - padding).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;

  return {
    linePath,
    fillPath,
    lastX: last.x,
    lastY: last.y,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Tiny inline SVG sparkline chart. Pure SVG — no recharts dependency.
 * Uses smooth cubic bezier curves for a polished look.
 */
export function SparkLine({
  data,
  width = 80,
  height = 28,
  color = '#10b981',
  showDot = true,
  strokeWidth = 1.5,
  filled = false,
  className,
  'aria-label': ariaLabel,
}: SparkLineProps) {
  if (!data || data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={cn('shrink-0', className)}
        aria-hidden={!ariaLabel}
        aria-label={ariaLabel}
      >
        <line
          x1="4"
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const padding = 3;
  const { linePath, fillPath, lastX, lastY } = buildPath(data, width, height, padding);
  const fillId = `sparkfill-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 overflow-visible', className)}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${fillId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && data.length > 0 && (
        <circle
          cx={lastX}
          cy={lastY}
          r={2.5}
          fill={color}
          stroke="transparent"
          strokeWidth="0"
        />
      )}
    </svg>
  );
}

SparkLine.displayName = 'SparkLine';

export default SparkLine;
