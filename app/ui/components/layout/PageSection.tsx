// app/ui/components/layout/PageSection.tsx
import React from 'react';
import clsx from 'clsx';

type PageSectionProps = {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function PageSection({
  title,
  description,
  children,
  className,
}: PageSectionProps) {
  return (
    <section
      className={clsx(
        'mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4',
        className
      )}
    >
      {(title || description) && (
        <header className="mb-3">
          {title && (
            <h2 className="text-sm font-medium text-slate-100">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-xs text-slate-400">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
