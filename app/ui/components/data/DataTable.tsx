// app/ui/components/data/DataTable.tsx
'use client';

import React from 'react';
import clsx from 'clsx';

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
};

type DataTableProps<T> = {
  ariaLabel: string;
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
};

export function DataTable<T>({
  ariaLabel,
  columns,
  rows,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  if (!rows.length) {
    return (
      <p className="text-xs text-slate-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-200"
        aria-label={ariaLabel}
      >
        <thead className="bg-slate-900/80">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                scope="col"
                className={clsx(
                  'px-3 py-2 font-medium text-slate-300',
                  column.width && column.width
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={clsx(
                'bg-slate-950',
                rowIndex % 2 === 0 && 'bg-slate-950/80'
              )}
            >
              {columns.map((column) => (
                <td key={String(column.key)} className="px-3 py-2 align-middle">
                  {column.render
                    ? column.render(row)
                    : (row as any)[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
