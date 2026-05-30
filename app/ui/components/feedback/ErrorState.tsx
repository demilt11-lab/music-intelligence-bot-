// app/ui/components/feedback/ErrorState.tsx
import React from 'react';

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a few seconds.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-sm text-red-100"
    >
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-xs text-red-200">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center rounded bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-400"
        >
          Retry
        </button>
      )}
    </div>
  );
}
