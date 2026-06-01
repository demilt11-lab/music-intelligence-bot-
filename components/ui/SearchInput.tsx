'use client';

import React, {
  forwardRef,
  InputHTMLAttributes,
  useEffect,
  useRef,
  KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Props for the SearchInput component. */
export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSubmit'> {
  /** Current search value. */
  value: string;
  /** Called when the value changes. */
  onChange: (value: string) => void;
  /** Called when the user submits (Enter key). */
  onSubmit?: (value: string) => void;
  /** Called when the clear button is clicked. */
  onClear?: () => void;
  /** Shows a loading spinner instead of the search icon. */
  isLoading?: boolean;
  /** Keyboard shortcut hint text. @default "⌘K" */
  shortcutHint?: string;
  /** Whether to show the keyboard shortcut hint. @default true */
  showShortcut?: boolean;
  /** Additional className for the wrapper div. */
  wrapperClassName?: string;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="15"
      height="15"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Search input with animated icon, loading spinner, clear button,
 * and keyboard shortcut hint. Handles ⌘K / / focus shortcut.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      onClear,
      isLoading = false,
      shortcutHint,
      showShortcut = true,
      placeholder = 'Search…',
      className,
      wrapperClassName,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? internalRef;

    // Detect OS for shortcut hint
    const isMac =
      typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
    const hint = shortcutHint ?? (isMac ? '⌘K' : 'Ctrl K');

    // Global keyboard shortcut: / or ⌘K to focus
    useEffect(() => {
      function handleGlobal(e: globalThis.KeyboardEvent) {
        const active = document.activeElement;
        const isInput =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement ||
          (active instanceof HTMLElement && active.isContentEditable);

        if (e.key === '/' && !isInput) {
          e.preventDefault();
          inputRef.current?.focus();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
      document.addEventListener('keydown', handleGlobal);
      return () => document.removeEventListener('keydown', handleGlobal);
    }, [inputRef]);

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit?.(value);
      }
      if (e.key === 'Escape') {
        if (value) {
          onChange('');
          onClear?.();
        } else {
          inputRef.current?.blur();
        }
      }
    }

    const hasValue = value.length > 0;

    return (
      <div
        className={cn(
          'relative flex items-center group',
          wrapperClassName,
        )}
      >
        {/* Left icon: search or spinner */}
        <span
          className={cn(
            'absolute left-3 flex items-center pointer-events-none',
            'transition-colors duration-150',
            isLoading ? 'text-emerald-400' : 'text-slate-500 group-focus-within:text-slate-300',
          )}
          aria-hidden="true"
        >
          {isLoading ? <Spinner /> : <SearchIcon />}
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label={rest['aria-label'] ?? 'Search'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            'w-full h-9 pl-9 pr-3 rounded-lg',
            'bg-slate-900 border border-slate-700',
            'text-sm text-slate-100 placeholder-slate-500',
            'transition-colors duration-150',
            'focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            // Room for clear button or shortcut hint
            (hasValue || showShortcut) && 'pr-16',
            className,
          )}
          {...rest}
        />

        {/* Right side: clear button or shortcut hint */}
        <div className="absolute right-2 flex items-center gap-1.5">
          {hasValue ? (
            <button
              type="button"
              onClick={() => {
                onChange('');
                onClear?.();
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className={cn(
                'w-5 h-5 flex items-center justify-center rounded',
                'text-slate-500 hover:text-slate-200 hover:bg-slate-700',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : showShortcut ? (
            <kbd
              className={cn(
                'hidden sm:inline-flex items-center px-1.5 py-0.5 rounded',
                'text-2xs font-medium text-slate-600 bg-slate-800 border border-slate-700',
                'pointer-events-none',
                'transition-opacity duration-150',
                'group-focus-within:opacity-0',
              )}
              aria-hidden="true"
            >
              {hint}
            </kbd>
          ) : null}
        </div>
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
