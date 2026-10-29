import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

type FeatureShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

export function FeatureShell({
  title,
  description,
  actions,
  filters,
  children,
}: FeatureShellProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border) pb-4">
          <CardTitle className="text-xs uppercase tracking-wider text-slate-500">Catalog</CardTitle>
          {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
        </CardHeader>
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </section>
  );
}
