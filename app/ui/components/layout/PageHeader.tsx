// app/ui/components/layout/PageHeader.tsx
import React from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
