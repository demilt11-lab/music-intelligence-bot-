// app/ui/components/data/EntityList.tsx
'use client';

import React from 'react';

type EntityListItem = {
  id: string | number;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
};

type EntityListProps = {
  items: EntityListItem[];
  ariaLabel: string;
};

export function EntityList({ items, ariaLabel }: EntityListProps) {
  if (!items.length) return null;

  return (
    <ul
      aria-label={ariaLabel}
      className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/60"
    >
      {items.map((item) => (
        <li key={item.id}>
          {item.href ? (
            <a
              href={item.href}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="text-sm font-medium text-slate-100">
                {item.title}
              </span>
              {item.subtitle && (
                <span className="text-xs text-slate-300">
                  {item.subtitle}
                </span>
              )}
              {item.meta && (
                <span className="text-xs text-slate-500">
                  {item.meta}
                </span>
              )}
            </a>
          ) : (
            <div className="flex flex-col gap-1 px-4 py-3">
              <span className="text-sm font-medium text-slate-100">
                {item.title}
              </span>
              {item.subtitle && (
                <span className="text-xs text-slate-300">
                  {item.subtitle}
                </span>
              )}
              {item.meta && (
                <span className="text-xs text-slate-500">
                  {item.meta}
                </span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
