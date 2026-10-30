import { FolderOpen, History, Loader2, Radar } from "lucide-react";
import { useEffect } from "react";

import { useWorkspaceStore } from "@/stores/workspace-store";

export function WorkspaceEmptyState() {
  const registry = useWorkspaceStore((state) => state.registry);
  const loading = useWorkspaceStore((state) => state.loading);
  const actionId = useWorkspaceStore((state) => state.actionId);
  const load = useWorkspaceStore((state) => state.load);
  const activate = useWorkspaceStore((state) => state.activate);
  const openPicker = useWorkspaceStore((state) => state.openPicker);

  useEffect(() => {
    if (!registry) void load();
  }, [load, registry]);

  const recent = Object.values(registry?.workspaces ?? {}).sort((left, right) =>
    (right.lastScannedAt ?? "").localeCompare(left.lastScannedAt ?? ""),
  );

  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-[#0e0e12] p-6">
      <div className="w-full max-w-xl">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
            <Radar className="size-6" />
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-100">
            Open an architecture workspace
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500">
            Routogram runs independently from your codebase. Choose a project or a{" "}
            <span className="font-mono text-zinc-400">src/</span> folder — nothing is written into
            the target repository.
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-600/25 px-4 py-2 text-xs font-medium text-indigo-100 shadow-[0_0_28px_rgba(99,102,241,0.18)] transition hover:bg-indigo-600/35"
          >
            <FolderOpen className="size-4" />
            Open Folder…
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="flex items-center gap-2 px-1 pb-2">
            <History className="size-3 text-zinc-600" />
            <h3 className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
              Recent workspaces
            </h3>
          </div>
          {loading && recent.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[10px] text-zinc-600">
              <Loader2 className="size-3 animate-spin" /> Loading workspaces…
            </div>
          ) : recent.length === 0 ? (
            <p className="py-6 text-center text-[10px] text-zinc-600">
              Imported workspaces will appear here.
            </p>
          ) : (
            <div className="space-y-1">
              {recent.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={actionId === workspace.id}
                  onClick={() => void activate(workspace.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.04] disabled:opacity-50"
                >
                  <FolderOpen className="size-3 shrink-0 text-zinc-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-zinc-200">
                      {workspace.name}
                    </span>
                    <span className="block truncate font-mono text-[8px] text-zinc-600">
                      {workspace.scanPath}
                    </span>
                  </span>
                  {actionId === workspace.id ? (
                    <Loader2 className="size-3 animate-spin text-zinc-500" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
