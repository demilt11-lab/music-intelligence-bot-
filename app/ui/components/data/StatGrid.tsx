// app/ui/components/data/StatGrid.tsx
import React from 'react';

type StatGridItem = {
  key: string;
  label: string;
  value: string | number;
};

type StatGridProps = {
  items: StatGridItem[];
};

export function StatGrid({ items }: StatGridProps) {
  if (!items.length) return null;

  return (
    <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="rounded-md bg-slate-900/80 px-3 py-2">
          <dt className="text-xs text-slate-400">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-50">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
