import type { LinterDetectionResult, PluginManifest } from "@routogram/types";
import { Check, Download, Loader2, Puzzle, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchPlugins, installPlugin, uninstallPlugin } from "@/lib/apis/plugins";
import { useWorkspaceStore } from "@/stores/workspace-store";

type PluginStoreModalProps = {
  open: boolean;
  onClose: () => void;
  onInstalled?: () => void;
};

export function PluginStoreModal({ open, onClose, onInstalled }: PluginStoreModalProps) {
  const activeWorkspaceId = useWorkspaceStore((state) => state.registry?.activeWorkspaceId ?? null);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [linters, setLinters] = useState<LinterDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void activeWorkspaceId;
    setLoading(true);
    setError(null);
    fetchPlugins()
      .then((result) => {
        setPlugins(result.plugins);
        setLinters(result.linters);
      })
      .catch((reason: unknown) => setError(message(reason)))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId, open]);

  const recommended = useMemo(() => new Set(linters?.recommendedPlugins ?? []), [linters]);
  const recommendedPlugins = plugins.filter((plugin) => recommended.has(plugin.id));
  const otherPlugins = plugins.filter((plugin) => !recommended.has(plugin.id));

  async function install(id: string): Promise<void> {
    setPendingPluginId(id);
    setError(null);
    try {
      const installed = await installPlugin(id);
      setPlugins((current) =>
        current.map((plugin) => (plugin.id === installed.id ? installed : plugin)),
      );
      onInstalled?.();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPendingPluginId(null);
    }
  }

  async function uninstall(id: string): Promise<void> {
    setPendingPluginId(id);
    setError(null);
    try {
      const removed = await uninstallPlugin(id);
      setPlugins((current) =>
        current.map((plugin) => (plugin.id === removed.id ? removed : plugin)),
      );
      onInstalled?.();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPendingPluginId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close plugin store"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plugin Store"
        className="relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e12] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Puzzle className="size-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Plugin Store</h2>
          </div>
          <button
            type="button"
            aria-label="Close plugin store"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Loading plugin catalog…
            </div>
          ) : (
            <div className="space-y-5">
              <PluginGroup
                title="Detected & Recommended for Workspace"
                subtitle={
                  linters
                    ? `${recommendedPlugins.length} recommended · ${linters.detectedLinters.length} linter(s) detected`
                    : "Workspace recommendations"
                }
                plugins={recommendedPlugins}
                pendingPluginId={pendingPluginId}
                onInstall={(id) => void install(id)}
                onUninstall={(id) => void uninstall(id)}
              />
              <PluginGroup
                title="All Available Plugins"
                subtitle={`${plugins.length} plugins`}
                plugins={otherPlugins}
                pendingPluginId={pendingPluginId}
                onInstall={(id) => void install(id)}
                onUninstall={(id) => void uninstall(id)}
              />
            </div>
          )}
          {error ? <p className="mt-3 text-[10px] text-rose-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PluginGroup({
  title,
  subtitle,
  plugins,
  pendingPluginId,
  onInstall,
  onUninstall,
}: {
  title: string;
  subtitle: string;
  plugins: PluginManifest[];
  pendingPluginId: string | null;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </h3>
        <span className="text-[9px] text-zinc-600">{subtitle}</span>
      </div>
      {plugins.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-[10px] text-zinc-600">
          No plugins in this group.
        </p>
      ) : (
        <div className="space-y-1.5">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-zinc-200">{plugin.name}</span>
                  <span className="rounded border border-zinc-700 px-1 py-0.5 text-[8px] uppercase text-zinc-500">
                    {plugin.kind}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[9px] text-zinc-500" title={plugin.description}>
                  {plugin.description}
                </p>
              </div>
              {plugin.installed ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400">
                    <Check className="size-2.5" /> Installed
                  </span>
                  <button
                    type="button"
                    disabled={pendingPluginId === plugin.id}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onUninstall(plugin.id);
                    }}
                    className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[9px] text-rose-300 transition-colors hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                    title="Uninstall plugin"
                  >
                    {pendingPluginId === plugin.id ? (
                      <>
                        <Loader2 className="size-2.5 animate-spin" />
                        Removing
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-2.5" /> Uninstall
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pendingPluginId === plugin.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onInstall(plugin.id);
                  }}
                  className="flex items-center gap-1 rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[9px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  {pendingPluginId === plugin.id ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <Download className="size-2.5" />
                  )}
                  Install
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
