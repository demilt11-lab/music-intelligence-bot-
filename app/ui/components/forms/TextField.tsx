// app/ui/components/forms/TextField.tsx
'use client';

import React from 'react';
import clsx from 'clsx';

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  helperText?: string;
  error?: string;
  className?: string;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  helperText,
  error,
  className,
}: TextFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium text-slate-200"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-white outline-none',
          'border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
        )}
        placeholder={placeholder}
        aria-describedby={[helperId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={!!error}
      />
      {helperText && !error && (
        <p id={helperId} className="text-xs text-slate-400">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
