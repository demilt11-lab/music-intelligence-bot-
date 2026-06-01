'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Props for the Pagination component. */
export interface PaginationProps {
  /** Current page number (1-based). */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Total number of items (for "Showing X–Y of Z"). */
  totalItems?: number;
  /** Number of items per page. */
  pageSize?: number;
  /** Called when the user selects a different page. */
  onPageChange: (page: number) => void;
  /** Whether to show a loading state. */
  loading?: boolean;
  /** Additional className for the root element. */
  className?: string;
  /** Whether to show the item count summary. @default true */
  showSummary?: boolean;
}

// ─── Page range builder ──────────────────────────────────────────────────────

type PageItem = number | '...';

function buildPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: PageItem[] = [1];

  const leftEdge = Math.max(2, page - 2);
  const rightEdge = Math.min(totalPages - 1, page + 2);

  if (leftEdge > 2) items.push('...');
  for (let i = leftEdge; i <= rightEdge; i++) items.push(i);
  if (rightEdge < totalPages - 1) items.push('...');

  items.push(totalPages);
  return items;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PageButton({
  children,
  active,
  disabled,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'min-w-[2rem] h-8 px-2 flex items-center justify-center rounded-lg',
        'text-sm font-medium tabular-nums transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950',
        active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      {children}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Data table pagination with smart ellipsis truncation and item count summary.
 * Shows "Showing X–Y of Z results" and supports keyboard navigation.
 */
export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize = 20,
  onPageChange,
  loading = false,
  className,
  showSummary = true,
}: PaginationProps) {
  const pageItems = buildPageItems(page, totalPages);

  const itemStart = totalItems ? Math.min((page - 1) * pageSize + 1, totalItems) : null;
  const itemEnd = totalItems ? Math.min(page * pageSize, totalItems) : null;

  if (totalPages <= 1 && !totalItems) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 flex-wrap',
        loading && 'opacity-60 pointer-events-none',
        className,
      )}
      aria-label="Pagination"
    >
      {/* Summary */}
      {showSummary && totalItems !== undefined && itemStart !== null && itemEnd !== null ? (
        <p className="text-sm text-slate-400 tabular-nums whitespace-nowrap">
          Showing{' '}
          <span className="text-slate-200 font-medium">{itemStart.toLocaleString()}</span>
          {' – '}
          <span className="text-slate-200 font-medium">{itemEnd.toLocaleString()}</span>
          {' of '}
          <span className="text-slate-200 font-medium">{totalItems.toLocaleString()}</span>{' '}
          results
        </p>
      ) : (
        <span />
      )}

      {/* Controls */}
      {totalPages > 1 && (
        <nav role="navigation" aria-label="Page navigation">
          <ol className="flex items-center gap-1 list-none">
            {/* Previous */}
            <li>
              <PageButton
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </PageButton>
            </li>

            {/* Page numbers */}
            {pageItems.map((item, idx) =>
              item === '...' ? (
                <li key={`ellipsis-${idx}`}>
                  <span
                    className="min-w-[2rem] h-8 flex items-center justify-center text-sm text-slate-600"
                    aria-hidden="true"
                  >
                    …
                  </span>
                </li>
              ) : (
                <li key={item}>
                  <PageButton
                    active={item === page}
                    onClick={() => item !== page && onPageChange(item)}
                    aria-label={`Page ${item}`}
                  >
                    {item}
                  </PageButton>
                </li>
              ),
            )}

            {/* Next */}
            <li>
              <PageButton
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </PageButton>
            </li>
          </ol>
        </nav>
      )}
    </div>
  );
}

Pagination.displayName = 'Pagination';

export default Pagination;
