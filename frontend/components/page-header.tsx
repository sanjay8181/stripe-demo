import * as React from 'react';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {action && <div className="flex items-center">{action}</div>}
    </div>
  );
}
