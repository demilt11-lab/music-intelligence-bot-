'use client';

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Visual style variants for the Button component. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

/** Size variants for the Button component. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Props for the Button component. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant. @default "primary" */
  variant?: ButtonVariant;
  /** Size variant. @default "md" */
  size?: ButtonSize;
  /** Shows an inline loading spinner and disables interaction. */
  loading?: boolean;
  /** Icon element rendered before the button label. */
  leftIcon?: React.ReactNode;
  /** Icon element rendered after the button label. */
  rightIcon?: React.ReactNode;
  /** Stretches the button to fill its container width. */
  fullWidth?: boolean;
  /** Accessible label override (use when no text label is present). */
  'aria-label'?: string;
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-emerald-600 text-white',
    'hover:bg-emerald-500',
    'active:bg-emerald-700',
    'focus-visible:ring-emerald-500/50',
    'disabled:bg-emerald-900 disabled:text-emerald-600',
    'shadow-sm',
  ].join(' '),
  secondary: [
    'bg-slate-800 text-slate-100 border border-slate-700',
    'hover:bg-slate-700 hover:border-slate-600',
    'active:bg-slate-900',
    'focus-visible:ring-slate-500/50',
    'disabled:bg-slate-900 disabled:text-slate-600 disabled:border-slate-800',
  ].join(' '),
  ghost: [
    'bg-transparent text-slate-300',
    'hover:bg-slate-800 hover:text-slate-100',
    'active:bg-slate-900',
    'focus-visible:ring-slate-500/50',
    'disabled:text-slate-600',
  ].join(' '),
  danger: [
    'bg-rose-600 text-white',
    'hover:bg-rose-500',
    'active:bg-rose-700',
    'focus-visible:ring-rose-500/50',
    'disabled:bg-rose-900 disabled:text-rose-600',
    'shadow-sm',
  ].join(' '),
  outline: [
    'bg-transparent text-emerald-400 border border-emerald-600',
    'hover:bg-emerald-950 hover:border-emerald-500',
    'active:bg-emerald-900',
    'focus-visible:ring-emerald-500/50',
    'disabled:text-emerald-800 disabled:border-emerald-900',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-6 text-base gap-2.5 rounded-xl',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

// ─── Loading spinner ─────────────────────────────────────────────────────────

function Spinner({ size }: { size: ButtonSize }) {
  return (
    <svg
      className={cn('animate-spin shrink-0', iconSizeClasses[size])}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Primary interactive button with multiple variants and states.
 * Supports loading spinner, icons, and full keyboard/a11y.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      className,
      onClick,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        onClick={isDisabled ? undefined : onClick}
        className={cn(
          // Base
          'inline-flex items-center justify-center font-medium',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
          'select-none',
          // Disabled base
          'disabled:cursor-not-allowed disabled:pointer-events-none',
          // Variant
          variantClasses[variant],
          // Size
          sizeClasses[size],
          // Full width
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner size={size} />
        ) : leftIcon ? (
          <span className={cn('shrink-0', iconSizeClasses[size])} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}

        {children && <span className={cn(loading && 'opacity-70')}>{children}</span>}

        {!loading && rightIcon && (
          <span className={cn('shrink-0', iconSizeClasses[size])} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
