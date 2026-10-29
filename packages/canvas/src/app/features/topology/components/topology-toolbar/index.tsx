import type { RoutogramTopology } from "@routogram/types";

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
  return (
    <>
      <div className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 font-mono text-xs text-zinc-400">
        {filteredTopology?.nodes.length ?? 0} nodes <span className="text-zinc-600">|</span>{" "}
        {filteredTopology?.edges.length ?? 0} edges
      </div>
      {highlightedNodeIds ? (
        <button
          type="button"
          onClick={onClearHighlight}
          className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[10px] text-sky-200 transition-colors hover:bg-sky-400/15"
        >
          {highlightedNodeIds.length} highlighted ×
        </button>
      ) : null}
    </>
  );
}
