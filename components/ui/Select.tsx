// components/ui/Select.tsx
'use client';

import React from 'react';

type SelectOption = { value: string; label: string };

type SelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
};

export function Select({ id, label, value, onChange, options, className }: SelectProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
