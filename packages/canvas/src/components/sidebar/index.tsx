import { ChevronsUpDown, GitFork, LayoutGrid, Radio } from "lucide-react";

import type { AppTab } from "@/layouts/app-shell";
import { cn } from "@/lib/utils/cn";

type SidebarProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  projectName: string;
  statusLabel: string;
  statusDot: string;
  version: string;
};

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "routing", label: "Route Topology", icon: GitFork },
] as const;

export function Sidebar({
  activeTab,
  onTabChange,
  projectName,
  statusLabel,
  statusDot,
  version,
}: SidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#09090b]">
      <div className="p-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-semibold text-white shadow-inner shadow-white/5">
            R
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-white">
              Routogram
            </p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">
              Architecture console
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
          title="Current workspace"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-300">
            {projectName}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 text-zinc-600" />
        </button>
      </div>

      <div className="px-3">
        <p className="px-2.5 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-600">
          Workspace
        </p>
        <nav className="mt-2 flex flex-col gap-0.5" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors",
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
                )}
              >
                <Icon className="size-4" strokeWidth={1.7} />
                <span className="flex-1">{item.label}</span>
                {active ? (
                  <span className="size-1 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${statusDot} shadow-[0_0_8px_currentColor]`} />
            <Radio className="size-3 text-zinc-600" />
            <span className="text-[10px] font-medium text-zinc-300">127.0.0.1:4040</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between pl-3.5">
            <span className="text-[9px] text-zinc-600">{statusLabel}</span>
            <span className="rounded border border-white/[0.06] px-1.5 py-0.5 font-mono text-[8px] text-zinc-600">
              v{version}
            </span>
          </div>
        </div>
        <p className="mt-3 px-1 text-[8px] uppercase tracking-[0.16em] text-zinc-700">
          Local-first architecture intelligence
        </p>
      </div>
    </aside>
  );
}
