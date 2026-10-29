import { Activity, ArrowUpRight, Boxes, GitBranch, LayoutGrid, Sparkles } from "lucide-react";

type OverviewPlaceholderProps = {
  projectName: string;
};

const METRICS = [
  { label: "Architecture score", value: "—", icon: Activity },
  { label: "Route health", value: "—", icon: GitBranch },
  { label: "Packages scanned", value: "—", icon: Boxes },
];

export function OverviewPlaceholder({ projectName }: OverviewPlaceholderProps) {
  return (
    <div className="relative h-full overflow-y-auto">
      <div className="absolute inset-0 pc-grid opacity-25" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/[0.045] blur-3xl" />

      <div className="relative mx-auto flex min-h-full max-w-4xl flex-col px-6 py-10">
        <div className="grid gap-3 sm:grid-cols-3">
          {METRICS.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                    {metric.label}
                  </span>
                  <Icon className="size-3.5 text-zinc-700" />
                </div>
                <p className="mt-4 text-2xl font-semibold text-zinc-700">{metric.value}</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.04]">
                  <div className="h-full w-1/3 rounded-full bg-white/[0.06]" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
          <div className="grid size-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] shadow-inner shadow-white/5">
            <LayoutGrid className="size-5 text-sky-300/80" strokeWidth={1.5} />
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-sky-400/15 bg-sky-400/[0.06] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-sky-300/80">
            <Sparkles className="size-3" />
            In development
          </span>
          <h2 className="mt-4 text-balance text-xl font-semibold tracking-tight text-zinc-200">
            {projectName} is taking shape.
          </h2>
          <p className="mt-2 max-w-sm text-[11px] leading-5 text-zinc-500">
            System metrics, route health & architecture overview are coming soon.
          </p>
          <div className="mt-6 flex items-center gap-1.5 text-[9px] text-zinc-700">
            <span className="size-1 rounded-full bg-zinc-700" />
            Overview modules are being wired into the daemon
          </div>
        </div>

        <div className="grid gap-3 pb-2 sm:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                Architecture activity
              </p>
              <ArrowUpRight className="size-3 text-zinc-700" />
            </div>
            <div className="mt-6 flex h-16 items-end gap-1.5">
              {[28, 44, 36, 62, 48, 74, 52, 68, 58, 80, 64, 88].map((height) => (
                <span
                  key={height}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-sky-400/5 to-sky-400/15"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
            <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">Next up</p>
            <div className="mt-3 space-y-2">
              {["Route health", "Dependency drift", "Bundle impact"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <span className="size-1 rounded-full bg-zinc-700" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
