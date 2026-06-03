'use client';

import React, { forwardRef, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SearchBarProps {
  /** Current search value. */
  value: string;
  /** Called with updated value (debounced if debounceMs is set). */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Called on Enter keypress. */
  onSubmit?: (value: string) => void;
  /** Debounce delay in ms. @default 300 */
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * Search input with Cmd/Ctrl+K shortcut hint, clear button, and optional debounce.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Search…',
      onSubmit,
      debounceMs = 300,
      className,
      disabled,
      isLoading,
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? internalRef;
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keyboard shortcut: Cmd/Ctrl+K
    useEffect(() => {
      function handler(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [inputRef]);

    function handleChange(raw: string) {
      if (debounceMs > 0) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => onChange(raw), debounceMs);
      } else {
        onChange(raw);
      }
    }

    const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
    const hint = isMac ? '⌘K' : 'Ctrl K';
    const hasValue = value.length > 0;

    return (
      <div className={cn('relative flex items-center group', className)}>
        {/* Left icon */}
        <span
          className="absolute left-3 text-slate-500 group-focus-within:text-slate-300 transition-colors pointer-events-none"
          aria-hidden
        >
          {isLoading ? (
            <svg className="animate-spin" width={15} height={15} viewBox="0 0 24 24" fill="none">
              <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} className="opacity-25" />
              <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
          )}
        </span>

        <input
          ref={inputRef}
          type="search"
          defaultValue={value}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          aria-label={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit?.(value);
            }
            if (e.key === 'Escape') {
              if (value) {
                onChange('');
                (e.target as HTMLInputElement).value = '';
              } else {
                inputRef.current?.blur();
              }
            }
          }}
          className={cn(
            'w-full h-9 pl-9 rounded-lg',
            'bg-slate-900 border border-slate-700',
            'text-sm text-slate-100 placeholder-slate-500',
            'transition-colors duration-150',
            'focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40',
            'disabled:opacity-50',
            hasValue || !isMac ? 'pr-16' : 'pr-10',
          )}
        />

        <div className="absolute right-2 flex items-center gap-1.5">
          {hasValue ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onChange('');
                if (inputRef.current) inputRef.current.value = '';
                inputRef.current?.focus();
              }}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1={18} y1={6} x2={6} y2={18} />
                <line x1={6} y1={6} x2={18} y2={18} />
              </svg>
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 bg-slate-800 border border-slate-700 pointer-events-none group-focus-within:opacity-0 transition-opacity">
              {hint}
            </kbd>
          )}
        </div>
      </div>
    );
  },
);

SearchBar.displayName = 'SearchBar';
