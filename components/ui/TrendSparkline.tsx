'use client';

import React, { useMemo, useId } from 'react';
import { SkeletonBox } from '@/components/ui/Skeleton';

export interface TrendSparklineProps {
  /** Array of numeric data points. */
  data: number[];
  /** Stroke color for the line. @default "#10b981" */
  color?: string;
  /** Height in pixels. @default 40 */
  height?: number;
  /** Width in pixels. @default 120 */
  width?: number;
  /** Show shimmer loading state. */
  loading?: boolean;
  className?: string;
}

/**
 * Pure SVG sparkline with gradient fill. Handles empty/single data gracefully.
 */
export function TrendSparkline({
  data,
  color = '#10b981',
  height = 40,
  width = 120,
  loading = false,
  className,
}: TrendSparklineProps) {
  const gradientId = useId();

  const { polylinePoints, fillPoints } = useMemo(() => {
    if (!data || data.length < 2) return { polylinePoints: '', fillPoints: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;

    const points = data.map((val, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (val - min) / range) * (height - pad * 2);
      return [x, y] as [number, number];
    });

    const polylinePoints = points.map(([x, y]) => `${x},${y}`).join(' ');

    // Close fill polygon at bottom
    const first = points[0];
    const last = points[points.length - 1];
    const fillPoints = [
      `${first[0]},${height}`,
      ...points.map(([x, y]) => `${x},${y}`),
      `${last[0]},${height}`,
    ].join(' ');

    return { polylinePoints, fillPoints };
  }, [data, width, height]);

  if (loading) {
    return <SkeletonBox style={{ width, height }} className="rounded" />;
  }

  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgb(51 65 85)"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Fill */}
      <polygon
        points={fillPoints}
        fill={`url(#${gradientId})`}
      />
      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
