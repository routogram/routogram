import type { RoutogramTopology } from "@routogram/types";
import { Puzzle } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPlugins } from "@/lib/apis/plugins";
import { PluginStoreModal } from "../plugin-store-modal";

export type TopologyToolbarProps = {
  filteredTopology: RoutogramTopology | null;
  highlightedNodeIds: string[] | null;
  onClearHighlight: () => void;
};

export function TopologyToolbar({
  filteredTopology,
  highlightedNodeIds,
  onClearHighlight,
}: TopologyToolbarProps) {
  const [pluginOpen, setPluginOpen] = useState(false);
  const [activePlugins, setActivePlugins] = useState(0);
  const [pluginRevision, setPluginRevision] = useState(0);

  useEffect(() => {
    void pluginOpen;
    void pluginRevision;
    fetchPlugins()
      .then((result) =>
        setActivePlugins(
          result.plugins.filter((plugin) => plugin.installed && plugin.enabled).length,
        ),
      )
      .catch(() => setActivePlugins(0));
  }, [pluginOpen, pluginRevision]);

  return (
    <>
      <div className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 font-mono text-xs text-zinc-400">
        {filteredTopology?.nodes.length ?? 0} nodes <span className="text-zinc-600">|</span>{" "}
        {filteredTopology?.edges.length ?? 0} edges
      </div>
      <button
        type="button"
        onClick={() => setPluginOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        title="Open Plugin Store"
      >
        <Puzzle className="size-3" />
        Plugins
        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 font-mono text-[8px] text-zinc-400">
          {activePlugins}
        </span>
      </button>
      {highlightedNodeIds ? (
        <button
          type="button"
          onClick={onClearHighlight}
          className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[10px] text-sky-200 transition-colors hover:bg-sky-400/15"
        >
          {highlightedNodeIds.length} highlighted ×
        </button>
      ) : null}
      <PluginStoreModal
        open={pluginOpen}
        onClose={() => setPluginOpen(false)}
        onInstalled={() => setPluginRevision((revision) => revision + 1)}
      />
    </>
  );
}
