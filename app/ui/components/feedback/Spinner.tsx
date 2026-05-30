// app/ui/components/feedback/Spinner.tsx
import React from 'react';
import clsx from 'clsx';

type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
};

export function Spinner({ size = 'md', label }: SpinnerProps) {
  const sizeClass =
    size === 'sm'
      ? 'h-4 w-4'
      : size === 'lg'
      ? 'h-8 w-8'
      : 'h-5 w-5';

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span
        className={clsx(
          'inline-block animate-spin rounded-full border-2 border-emerald-400 border-t-transparent',
          sizeClass
        )}
      />
      {label && (
        <span className="text-sm text-slate-300">{label}</span>
      )}
      <span className="sr-only">
        {label ?? 'Loading'}
      </span>
    </div>
  );
}
