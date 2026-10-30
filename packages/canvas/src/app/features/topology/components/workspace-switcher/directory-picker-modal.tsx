import type { DirectoryEntry, PathInspectionResult } from "@routogram/types";
import { ChevronLeft, FolderOpen, HardDrive, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  inspectWorkspacePath,
  listServerDirectories,
  pickWorkspaceDirectory,
} from "@/lib/apis/workspaces";
import { isDesktopEnvironment } from "@/lib/desktop/desktop-bridge";
import { useWorkspaceStore } from "@/stores/workspace-store";

type DirectoryPickerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function DirectoryPickerModal({ open, onClose }: DirectoryPickerModalProps) {
  const add = useWorkspaceStore((state) => state.add);
  const actionId = useWorkspaceStore((state) => state.actionId);
  const [manualPath, setManualPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [inspection, setInspection] = useState<PathInspectionResult | null>(null);
  const [scanPath, setScanPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectories = useCallback(async (path?: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await listServerDirectories(path);
      setCurrentPath(result.path);
      setEntries(result.entries);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const inspect = useCallback(async (path: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await inspectWorkspacePath(path);
      setInspection(result);
      if (result.valid) {
        const targetIsSrc = result.scanPath.replace(/\/$/, "").endsWith("/src");
        setScanPath(targetIsSrc ? result.scanPath : result.projectRoot);
        setManualPath((current) => current || result.scanPath);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInspection(null);
    void loadDirectories();
  }, [loadDirectories, open]);

  useEffect(() => {
    if (!open || !manualPath.trim()) return;
    const timer = window.setTimeout(() => {
      void inspect(manualPath.trim());
    }, 450);
    return () => window.clearTimeout(timer);
  }, [inspect, manualPath, open]);

  async function browseWithOs(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await pickWorkspaceDirectory();
      if (result.path) {
        setManualPath(result.path);
        await inspect(result.path);
      } else if (!result.supported) {
        setError(
          "Native folder dialog is unavailable here. Use the server browser or enter a path.",
        );
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function importWorkspace(): Promise<void> {
    if (!inspection?.valid) return;
    setBusy(true);
    setError(null);
    try {
      await add(inspection.scanPath, scanPath || inspection.projectRoot);
      onClose();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const parent = currentPath.replace(/\/[^/]+\/?$/, "") || "/";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0e0e12] shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Open Workspace Folder</h2>
          </div>
          <button
            type="button"
            aria-label="Close directory picker"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1.1fr_0.9fr]">
          <section className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Server browser
              </h3>
              {isDesktopEnvironment() ? (
                <button
                  type="button"
                  onClick={() => void browseWithOs()}
                  disabled={busy}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                >
                  OS Dialog...
                </button>
              ) : (
                <span className="text-[9px] text-zinc-600">Use the browser or type a path</span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1">
              <button
                type="button"
                aria-label="Parent directory"
                onClick={() => void loadDirectories(parent)}
                className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <p
                className="min-w-0 truncate font-mono text-[10px] text-zinc-500"
                title={currentPath}
              >
                {currentPath || "Loading…"}
              </p>
            </div>

            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {busy && entries.length === 0 ? (
                <div className="flex items-center gap-2 px-2 py-4 text-[10px] text-zinc-500">
                  <Loader2 className="size-3 animate-spin" /> Loading directories…
                </div>
              ) : null}
              {entries.map((entry) => (
                <div key={entry.path} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void loadDirectories(entry.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    <HardDrive className="size-3 shrink-0 text-zinc-600" />
                    <span className="truncate">{entry.name}</span>
                    {entry.hasPackageJson ? (
                      <span className="shrink-0 rounded bg-indigo-500/15 px-1 text-[8px] text-indigo-300">
                        package
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPath(entry.path);
                      void inspect(entry.path);
                    }}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-zinc-500"
                  >
                    Select
                  </button>
                </div>
              ))}
              {!busy && entries.length === 0 ? (
                <p className="px-2 py-4 text-[10px] text-zinc-600">No subdirectories.</p>
              ) : null}
            </div>

            <div className="mt-3 border-t border-zinc-800 pt-2">
              <label
                htmlFor="workspace-manual-path"
                className="text-[9px] uppercase tracking-wider text-zinc-600"
              >
                Manual absolute path
              </label>
              <input
                id="workspace-manual-path"
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="/path/to/project or /path/to/project/src"
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[10px] text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
          </section>

          <section className="min-w-0">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Import preview
            </h3>
            {inspection ? (
              <div className="mt-2 space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
                <PreviewRow label="Project root" value={inspection.projectRoot} />
                <PreviewRow label="Scan target" value={scanPath || inspection.scanPath} />
                <PreviewRow label="Framework" value={inspection.detectedFramework ?? "Auto"} />
                <PreviewRow label="Name" value={inspection.suggestedName} />
                {inspection.hasSrcSubdir ? (
                  <div className="flex gap-1 pt-1">
                    <ScanOption
                      active={scanPath === inspection.projectRoot}
                      label="Entire project"
                      onClick={() => setScanPath(inspection.projectRoot)}
                    />
                    <ScanOption
                      active={scanPath.endsWith("/src")}
                      label="src/ only"
                      onClick={() => setScanPath(`${inspection.projectRoot}/src`)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-[10px] text-zinc-600">
                Choose a folder or enter a path to inspect it.
              </p>
            )}

            {error ? <p className="mt-2 text-[10px] text-rose-300">{error}</p> : null}

            <button
              type="button"
              onClick={() => void importWorkspace()}
              disabled={!inspection?.valid || busy || actionId === "add"}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/60 bg-indigo-600/25 px-3 py-2 text-[11px] font-medium text-indigo-100 hover:bg-indigo-600/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionId === "add" || busy ? <Loader2 className="size-3 animate-spin" /> : null}
              Import & Scan Workspace
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-300">{value}</p>
    </div>
  );
}

function ScanOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[9px] ${
        active
          ? "border-indigo-500 bg-indigo-500/20 text-indigo-200"
          : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
      }`}
    >
      {label}
    </button>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
