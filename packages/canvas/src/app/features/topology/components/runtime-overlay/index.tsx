import type { RoutogramRuntimeSnapshot } from "@routogram/types";

import { formatBytes } from "@/lib/utils/format";

export type RuntimeOverlayProps = {
  runtime: RoutogramRuntimeSnapshot | null;
};

export function RuntimeOverlay({ runtime }: RuntimeOverlayProps) {
  if (!runtime) {
    return null;
  }

  const hotComponents = runtime.components.filter(
    (component) => component.recentRenders >= 2,
  ).length;
  const requestBytes = runtime.apiCalls.reduce(
    (total, call) => total + call.requestBytes + call.responseBytes,
    0,
  );

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 w-56 rounded-xl border border-emerald-400/20 bg-(--rg-surface)/90 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Runtime live
        </span>
        <span className="font-mono text-[9px] text-slate-600">{runtime.route}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-mono text-sm text-slate-200">{hotComponents}</div>
          <div className="text-[8px] uppercase tracking-wider text-slate-600">hot</div>
        </div>
        <div>
          <div className="font-mono text-sm text-slate-200">{runtime.apiCalls.length}</div>
          <div className="text-[8px] uppercase tracking-wider text-slate-600">calls</div>
        </div>
        <div>
          <div className="font-mono text-sm text-slate-200">{formatBytes(requestBytes)}</div>
          <div className="text-[8px] uppercase tracking-wider text-slate-600">payload</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[8px] text-slate-600">
        <span>render heat</span>
        <span className="h-1 flex-1 rounded-full bg-emerald-400/60" />
        <span className="h-1 flex-1 rounded-full bg-amber-400/70" />
        <span className="h-1 flex-1 rounded-full bg-rose-500/80" />
        <span>spike</span>
      </div>
    </div>
  );
}
