import { ChevronDown, FolderOpen, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { DirectoryPickerModal } from "./directory-picker-modal";

export function WorkspaceSwitcher() {
  const registry = useWorkspaceStore((state) => state.registry);
  const loading = useWorkspaceStore((state) => state.loading);
  const actionId = useWorkspaceStore((state) => state.actionId);
  const pickerOpen = useWorkspaceStore((state) => state.pickerOpen);
  const load = useWorkspaceStore((state) => state.load);
  const activate = useWorkspaceStore((state) => state.activate);
  const remove = useWorkspaceStore((state) => state.remove);
  const rescan = useWorkspaceStore((state) => state.rescan);
  const openPicker = useWorkspaceStore((state) => state.openPicker);
  const closePicker = useWorkspaceStore((state) => state.closePicker);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!registry) void load();
  }, [load, registry]);

  if (typeof window.__ROUTOGRAM_DATA__ !== "undefined") return null;

  const activeId = registry?.activeWorkspaceId ?? null;
  const active = activeId ? registry?.workspaces[activeId] : null;
  const workspaces = Object.values(registry?.workspaces ?? {}).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return (
    <>
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 max-w-[19rem] items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-left transition-colors hover:bg-white/[0.06]"
        >
          <FolderOpen className="size-3.5 shrink-0 text-indigo-400" />
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-medium text-zinc-200">
              {active?.name ?? (loading ? "Loading workspaces…" : "No workspace")}
            </span>
            <span className="block truncate font-mono text-[8px] text-zinc-600">
              {active ? shortPath(active.scanPath) : "Open a project folder"}
            </span>
          </span>
          {active?.framework ? (
            <span className="shrink-0 rounded border border-sky-400/20 bg-sky-400/10 px-1 text-[8px] uppercase text-sky-300">
              {frameworkLabel(active.framework)}
            </span>
          ) : null}
          <ChevronDown className="size-3 shrink-0 text-zinc-600" />
        </button>

        {open ? (
          <>
            <button
              type="button"
              aria-label="Close workspace menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-800 bg-[#0e0e12] shadow-2xl">
              <div className="border-b border-zinc-800 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-zinc-600">Workspaces</p>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {workspaces.length === 0 ? (
                  <p className="px-3 py-5 text-center text-[10px] text-zinc-600">
                    No workspaces yet.
                  </p>
                ) : (
                  workspaces.map((workspace) => (
                    <div
                      key={workspace.id}
                      className={`flex items-center gap-1 rounded-lg ${
                        workspace.id === activeId ? "bg-indigo-500/10" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          if (workspace.id !== activeId) void activate(workspace.id);
                        }}
                        className="min-w-0 flex-1 px-2 py-1.5 text-left"
                      >
                        <span className="block truncate text-[10px] text-zinc-200">
                          {workspace.name}
                        </span>
                        <span className="block truncate font-mono text-[8px] text-zinc-600">
                          {shortPath(workspace.scanPath)}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${workspace.name}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${workspace.name} from Routogram?`)) {
                            void remove(workspace.id);
                          }
                        }}
                        className="mr-1 rounded p-1 text-zinc-600 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-1 border-t border-zinc-800 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openPicker();
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2 py-1.5 text-[10px] text-indigo-200 hover:bg-indigo-500/20"
                >
                  <Plus className="size-3" /> Open Folder / Add
                </button>
                <button
                  type="button"
                  disabled={!active || actionId === activeId}
                  onClick={() => active && void rescan(active.id)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-400 hover:bg-white/5 disabled:opacity-40"
                >
                  {actionId === activeId ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Rescan
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <DirectoryPickerModal
        open={pickerOpen}
        onClose={() => {
          closePicker();
          setOpen(false);
          void load();
        }}
      />
    </>
  );
}

function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return `…/${parts.slice(-2).join("/")}`;
}

function frameworkLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "next" || normalized === "next.js") return "Next.js";
  if (normalized === "react") return "React";
  if (normalized === "vue") return "Vue";
  return value;
}
