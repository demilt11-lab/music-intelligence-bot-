'use client'

import React, { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type SkeletonVariant =
  | 'text'
  | 'card'
  | 'avatar'
  | 'stat'
  | 'table-row'
  | 'chart'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
  width?: string | number
  height?: string | number
  animated?: boolean
}

export function SkeletonBox({
  className,
  width,
  height,
  animated = true,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-white/[0.06]',
        animated && 'shimmer',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  )
}

function TextSkeleton({ className, width = '100%', ...rest }: SkeletonProps) {
  return <SkeletonBox className={cn('h-4', className)} width={width} {...rest} />
}

function CardSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,11,0.96))] p-4 flex flex-col gap-3',
        className
      )}
      aria-hidden="true"
    >
      <SkeletonBox className="h-32 w-full rounded-[16px]" animated={animated} />
      <SkeletonBox className="h-4 w-3/4" animated={animated} />
      <SkeletonBox className="h-3 w-1/2" animated={animated} />
      <div className="mt-1 flex gap-2">
        <SkeletonBox className="h-6 w-16 rounded-full" animated={animated} />
        <SkeletonBox className="h-6 w-16 rounded-full" animated={animated} />
      </div>
    </div>
  )
}

function AvatarSkeleton({
  className,
  width = 40,
  height = 40,
  animated = true,
}: SkeletonProps) {
  return (
    <SkeletonBox
      className={cn('shrink-0 rounded-full', className)}
      width={width}
      height={height}
      animated={animated}
    />
  )
}

function StatSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      <SkeletonBox className="h-3 w-20" animated={animated} />
      <SkeletonBox className="h-8 w-28" animated={animated} />
      <SkeletonBox className="h-3 w-16" animated={animated} />
    </div>
  )
}

function TableRowSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-b border-white/10 px-4 py-3',
        className
      )}
      aria-hidden="true"
    >
      <SkeletonBox className="h-9 w-9 shrink-0 rounded-md" animated={animated} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <SkeletonBox className="h-3.5" width="55%" animated={animated} />
        <SkeletonBox className="h-3" width="35%" animated={animated} />
      </div>
      <SkeletonBox className="h-6 w-16 shrink-0 rounded-full" animated={animated} />
      <SkeletonBox className="h-3.5 w-20 shrink-0" animated={animated} />
      <SkeletonBox className="h-3.5 w-14 shrink-0" animated={animated} />
    </div>
  )
}

function ChartSkeleton({ className, animated = true }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      <div className="flex h-32 items-end gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBox
            key={i}
            className="flex-1 rounded-sm"
            height={`${30 + Math.sin(i * 1.2) * 20 + Math.random() * 40}%`}
            animated={animated}
          />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonBox key={i} className="h-3 flex-1 rounded" animated={animated} />
        ))}
      </div>
    </div>
  )
}

export function Skeleton({ variant = 'text', ...props }: SkeletonProps) {
  switch (variant) {
    case 'card':
      return <CardSkeleton {...props} />
    case 'avatar':
      return <AvatarSkeleton {...props} />
    case 'stat':
      return <StatSkeleton {...props} />
    case 'table-row':
      return <TableRowSkeleton {...props} />
    case 'chart':
      return <ChartSkeleton {...props} />
    default:
      return <TextSkeleton {...props} />
  }
}

Skeleton.displayName = 'Skeleton'

export { TextSkeleton as SkeletonText }
export { CardSkeleton as SkeletonCard }
export { AvatarSkeleton as SkeletonAvatar }
export { StatSkeleton as SkeletonStat }
export { TableRowSkeleton as SkeletonTableRow }
export { ChartSkeleton as SkeletonChart }
export default Skeleton

export function TrackCardSkeleton() {
  return (
    <div
      className="space-y-4 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96)_0%,rgba(10,10,11,0.98)_100%)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
      aria-hidden
    >
      <div className="flex items-start gap-4">
        <div className="flex w-11 shrink-0 flex-col items-center">
          <SkeletonBox className="h-3 w-8" />
          <SkeletonBox className="mt-2 h-8 w-8 rounded-md" />
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <SkeletonBox className="h-5 w-12 rounded-full" />
            <SkeletonBox className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonBox className="h-5 w-4/5" />
          <SkeletonBox className="h-4 w-2/3" />
          <SkeletonBox className="h-4 w-full" />
        </div>

        <SkeletonBox className="h-[52px] w-[52px] shrink-0 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SkeletonBox className="h-16 rounded-2xl" />
        <SkeletonBox className="h-16 rounded-2xl" />
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
        <SkeletonBox className="mb-3 h-3 w-24" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonBox className="h-7 w-7 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <SkeletonBox className="h-3 w-14" />
                  <SkeletonBox className="h-3 w-12" />
                </div>
                <SkeletonBox className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
        <SkeletonBox className="mb-3 h-3 w-28" />
        <div className="flex items-start gap-2">
          <SkeletonBox className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-4 w-full" />
            <SkeletonBox className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  )
}
