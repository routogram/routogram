import { ChevronDown, ChevronRight, Database } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

export type StoreItem = {
  name: string;
  consumerCount: number;
  nodeIds: string[];
};

type StoresPanelProps = {
  stores: StoreItem[];
  hoveredStoreName: string | null;
  onHoverStore: (name: string | null) => void;
};

export function StoresPanel({ stores, hoveredStoreName, onHoverStore }: StoresPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (stores.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-3 top-3 z-20 w-64 overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0e0e11]/90 shadow-2xl backdrop-blur-md transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-zinc-800/40"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Database className="size-3.5 text-indigo-400" />
          <span className="text-xs font-medium tracking-wide text-zinc-300">State Stores</span>
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            {stores.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="size-3.5 text-zinc-500" />
        )}
      </button>

      {isExpanded ? (
        <div className="max-h-60 space-y-1 overflow-y-auto border-t border-zinc-800/50 p-1.5">
          {stores.map((store) => {
            const isActive = hoveredStoreName === store.name;
            return (
              <button
                key={store.name}
                type="button"
                onMouseEnter={() => onHoverStore(store.name)}
                onMouseLeave={() => onHoverStore(null)}
                onFocus={() => onHoverStore(store.name)}
                onBlur={() => onHoverStore(null)}
                title={`${store.consumerCount} component${store.consumerCount === 1 ? "" : "s"} use ${store.name}`}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left font-mono text-xs transition-all duration-150",
                  isActive
                    ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                    : "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
                )}
              >
                <span className="truncate pr-2">{store.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]",
                    isActive ? "bg-indigo-500/30 text-indigo-300" : "bg-zinc-800 text-zinc-500",
                  )}
                >
                  {store.consumerCount} {store.consumerCount === 1 ? "node" : "nodes"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
