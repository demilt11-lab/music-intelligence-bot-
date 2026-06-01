'use client';

import React, {
  forwardRef,
  useEffect,
  useRef,
  useId,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Size variants for the Modal. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/** Props for the root Modal component. */
export interface ModalProps {
  /** Whether the modal is visible. */
  isOpen: boolean;
  /** Called when the modal requests to close (Escape, backdrop click). */
  onClose: () => void;
  /** Modal heading text. */
  title?: string;
  /** Optional description text rendered beneath the title. */
  description?: string;
  /** Size variant. @default "md" */
  size?: ModalSize;
  /** Disables closing via backdrop click. */
  disableBackdropClose?: boolean;
  /** Additional className for the dialog panel. */
  className?: string;
  /** Modal content. */
  children?: ReactNode;
}

/** Props for Modal.Header, Modal.Body, Modal.Footer sections. */
export interface ModalSectionProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const sizeClasses: Record<ModalSize, string> = {
  sm:   'max-w-sm',
  md:   'max-w-lg',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]',
};

// ─── Focus trap helper ───────────────────────────────────────────────────────

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function trapFocus(el: HTMLElement, e: KeyboardEvent) {
  const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const ModalHeader = forwardRef<HTMLDivElement, ModalSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-4', className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
ModalHeader.displayName = 'Modal.Header';

const ModalBody = forwardRef<HTMLDivElement, ModalSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 overflow-y-auto flex-1', className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
ModalBody.displayName = 'Modal.Body';

const ModalFooter = forwardRef<HTMLDivElement, ModalSectionProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3', className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
ModalFooter.displayName = 'Modal.Footer';

// ─── Root component ──────────────────────────────────────────────────────────

type ModalWithSubComponents = ((props: ModalProps) => React.ReactElement | null) & {
  Header: typeof ModalHeader;
  Body: typeof ModalBody;
  Footer: typeof ModalFooter;
  displayName?: string;
};

/**
 * Accessible modal dialog with focus trap, Escape key handling,
 * and backdrop click dismiss. Renders into a portal.
 */
function ModalRoot({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  disableBackdropClose = false,
  className,
  children,
}: ModalProps): React.ReactElement | null {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock scroll and manage focus
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    // Focus the dialog on next tick
    const raf = requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable?.[0];
      if (first) first.focus();
      else dialogRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        trapFocus(dialogRef.current, e);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center p-4"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={disableBackdropClose ? undefined : onClose}
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${uid}-title` : undefined}
        aria-describedby={description ? `${uid}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full flex flex-col',
          'bg-slate-900 border border-slate-700 rounded-2xl shadow-card-elevated',
          'animate-scale-in',
          'max-h-[calc(100vh-4rem)] overflow-hidden',
          'focus:outline-none',
          sizeClasses[size],
          className,
        )}
      >
        {/* Built-in header when title is provided */}
        {(title || description) && (
          <div className="px-6 py-4 border-b border-slate-800 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id={`${uid}-title`}
                  className="text-base font-semibold text-slate-50 leading-snug"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={`${uid}-desc`}
                  className="mt-1 text-sm text-slate-400 leading-relaxed"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={cn(
                'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg',
                'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}

ModalRoot.displayName = 'Modal';

export const Modal = ModalRoot as ModalWithSubComponents;
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
