// components/ui/DataTable.tsx
'use client';

import React from 'react';

type Column<T> = {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  caption?: string;
};

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data to display.',
  caption,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm text-slate-300">Loading…</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-8 text-center">
        <p className="text-sm text-slate-300">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
      <table className="min-w-full divide-y divide-slate-800">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-900">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-800/40">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-2 text-sm ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
