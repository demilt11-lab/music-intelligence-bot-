'use client';

import React, {
  useState,
  useRef,
  useId,
  useCallback,
  ReactNode,
  HTMLAttributes,
  cloneElement,
  isValidElement,
} from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Preferred position for the tooltip. Will auto-flip if out of bounds. */
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/** Props for the Tooltip component. */
export interface TooltipProps {
  /** Tooltip content. Can be a string or JSX. */
  content: ReactNode;
  /** Preferred placement. @default "top" */
  position?: TooltipPosition;
  /** Delay in ms before showing. @default 300 */
  delay?: number;
  /** Max width for the tooltip bubble. @default 240 */
  maxWidth?: number;
  /** The trigger element. Must be a single React element. */
  children: React.ReactElement<HTMLAttributes<HTMLElement>>;
  /** Whether the tooltip is disabled. */
  disabled?: boolean;
}

// ─── Position classes ─────────────────────────────────────────────────────────

const positionClasses: Record<TooltipPosition, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrowClasses: Record<TooltipPosition, string> = {
  top:    'top-full left-1/2 -translate-x-1/2 border-t-slate-700 border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-700 border-x-transparent border-t-transparent',
  left:   'left-full top-1/2 -translate-y-1/2 border-l-slate-700 border-y-transparent border-r-transparent',
  right:  'right-full top-1/2 -translate-y-1/2 border-r-slate-700 border-y-transparent border-l-transparent',
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Lightweight tooltip using pure JS state — no Radix or Floating UI.
 * Adds aria-describedby to the trigger element for accessibility.
 */
export function Tooltip({
  content,
  position = 'top',
  delay = 300,
  maxWidth = 240,
  children,
  disabled = false,
}: TooltipProps) {
  const uid = useId();
  const [visible, setVisible] = useState(false);
  const [actualPos, setActualPos] = useState<TooltipPosition>(position);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (disabled) return;
    showTimer.current = setTimeout(() => {
      setVisible(true);
      // Auto-flip check
      requestAnimationFrame(() => {
        const trigger = triggerRef.current?.getBoundingClientRect();
        const tip = tooltipRef.current?.getBoundingClientRect();
        if (!trigger || !tip) return;
        let pos = position;
        if (pos === 'top' && trigger.top - tip.height < 8) pos = 'bottom';
        else if (pos === 'bottom' && trigger.bottom + tip.height > window.innerHeight - 8) pos = 'top';
        else if (pos === 'left' && trigger.left - tip.width < 8) pos = 'right';
        else if (pos === 'right' && trigger.right + tip.width > window.innerWidth - 8) pos = 'left';
        setActualPos(pos);
      });
    }, delay);
  }, [disabled, delay, position]);

  const hide = useCallback(() => {
    clearTimeout(showTimer.current);
    setVisible(false);
  }, []);

  if (!isValidElement(children)) return children;

  const trigger = cloneElement(children, {
    ref: triggerRef,
    'aria-describedby': visible ? uid : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show();
      (children.props as HTMLAttributes<HTMLElement>).onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      (children.props as HTMLAttributes<HTMLElement>).onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show();
      (children.props as HTMLAttributes<HTMLElement>).onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      (children.props as HTMLAttributes<HTMLElement>).onBlur?.(e);
    },
  } as HTMLAttributes<HTMLElement> & { ref: React.Ref<HTMLElement> });

  return (
    <span className="relative inline-flex">
      {trigger}
      {visible && content && (
        <div
          ref={tooltipRef}
          id={uid}
          role="tooltip"
          className={cn(
            'absolute z-[1500] pointer-events-none',
            'animate-fade-in',
            positionClasses[actualPos],
          )}
          style={{ maxWidth }}
        >
          <div
            className={cn(
              'px-2.5 py-1.5 rounded-lg',
              'bg-slate-800 border border-slate-700',
              'text-xs text-slate-100 leading-snug',
              'shadow-card-elevated',
              'whitespace-pre-wrap break-words',
            )}
          >
            {content}
          </div>
          {/* Arrow */}
          <span
            className={cn(
              'absolute w-0 h-0 border-4',
              arrowClasses[actualPos],
            )}
            aria-hidden="true"
          />
        </div>
      )}
    </span>
  );
}

Tooltip.displayName = 'Tooltip';

export default Tooltip;
