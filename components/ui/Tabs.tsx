'use client';

import React, { useState, useRef, useId } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single tab item definition. */
export interface TabItem {
  /** Unique identifier for this tab. */
  id: string;
  /** Display label. */
  label: string;
  /** Optional numeric count shown as a badge. */
  count?: number;
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
  /** Content to render when this tab is active. */
  content?: React.ReactNode;
  /** Whether this tab is disabled. */
  disabled?: boolean;
}

/** Visual style variant for the Tabs component. */
export type TabsVariant = 'underline' | 'pills' | 'boxed';

/** Props for the Tabs component. */
export interface TabsProps {
  /** Array of tab definitions. */
  tabs: TabItem[];
  /** ID of the initially active tab (uncontrolled). */
  defaultTab?: string;
  /** Controlled active tab ID. */
  activeTab?: string;
  /** Called when the active tab changes. */
  onChange?: (id: string) => void;
  /** Visual style variant. @default "underline" */
  variant?: TabsVariant;
  /** Additional className for the root element. */
  className?: string;
  /** Additional className for the tab list. */
  listClassName?: string;
  /** Additional className for the tab content panel. */
  panelClassName?: string;
  /** Whether to render tab content panels (false = headless tabs list only). */
  renderContent?: boolean;
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const listVariantClasses: Record<TabsVariant, string> = {
  underline: 'border-b border-slate-800 gap-0',
  pills:     'gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800',
  boxed:     'gap-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden',
};

function getTabClasses(variant: TabsVariant, isActive: boolean, isDisabled: boolean): string {
  const base = 'inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950';
  const disabled = 'opacity-40 cursor-not-allowed pointer-events-none';

  if (variant === 'underline') {
    return cn(
      base,
      'px-4 py-2.5 border-b-2 -mb-px rounded-t-md',
      isActive
        ? 'border-emerald-500 text-emerald-400'
        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600',
      isDisabled && disabled,
    );
  }

  if (variant === 'pills') {
    return cn(
      base,
      'px-3 py-1.5 rounded-lg',
      isActive
        ? 'bg-slate-700 text-slate-100 shadow-sm'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
      isDisabled && disabled,
    );
  }

  // boxed
  return cn(
    base,
    'px-4 py-2.5 border-r border-slate-800 last:border-r-0',
    isActive
      ? 'bg-slate-800 text-slate-100'
      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850',
    isDisabled && disabled,
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Accessible tabbed interface with keyboard navigation.
 * Supports underline, pills, and boxed visual variants.
 * Implements ARIA tablist/tab/tabpanel pattern.
 */
export function Tabs({
  tabs,
  defaultTab,
  activeTab: controlledTab,
  onChange,
  variant = 'underline',
  className,
  listClassName,
  panelClassName,
  renderContent = true,
}: TabsProps) {
  const uid = useId();
  const [internalTab, setInternalTab] = useState<string>(
    defaultTab ?? tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id ?? '',
  );

  const isControlled = controlledTab !== undefined;
  const active = isControlled ? controlledTab : internalTab;

  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  function activate(id: string) {
    if (!isControlled) setInternalTab(id);
    onChange?.(id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, currentId: string) {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const idx = enabledTabs.findIndex((t) => t.id === currentId);

    let next: string | undefined;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = enabledTabs[(idx + 1) % enabledTabs.length]?.id;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = enabledTabs[(idx - 1 + enabledTabs.length) % enabledTabs.length]?.id;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = enabledTabs[0]?.id;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = enabledTabs[enabledTabs.length - 1]?.id;
    }

    if (next) {
      activate(next);
      tabRefs.current.get(next)?.focus();
    }
  }

  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Tabs"
        className={cn('flex items-center', listVariantClasses[variant], listClassName)}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              aria-controls={renderContent ? `${uid}-panel-${tab.id}` : undefined}
              aria-disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && activate(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={getTabClasses(variant, isActive, !!tab.disabled)}
            >
              {tab.icon && (
                <span className="w-4 h-4 shrink-0" aria-hidden="true">
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium tabular-nums',
                    isActive
                      ? 'bg-emerald-900 text-emerald-300'
                      : 'bg-slate-800 text-slate-400',
                  )}
                  aria-label={`${tab.count} items`}
                >
                  {tab.count > 999 ? '999+' : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {renderContent &&
        tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${uid}-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${tab.id}`}
            hidden={tab.id !== active}
            tabIndex={0}
            className={cn(
              'focus:outline-none',
              tab.id === active && 'animate-fade-in',
              panelClassName,
            )}
          >
            {tab.id === active && tab.content}
          </div>
        ))}
    </div>
  );
}

Tabs.displayName = 'Tabs';

export default Tabs;
