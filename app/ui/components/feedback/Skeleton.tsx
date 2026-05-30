// app/ui/components/feedback/Skeleton.tsx
import React from 'react';
import clsx from 'clsx';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-md bg-slate-800/80',
        className
      )}
      aria-hidden="true"
    />
  );
}
