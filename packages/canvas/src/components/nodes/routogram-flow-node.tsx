import type { HealthLevel } from "@routogram/plugin-core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { AlertTriangle, Check, Info } from "lucide-react";
import type { ReactNode } from "react";

export type GraphNodeIssue = {
  id: string;
  severity: "danger" | "warning" | "tidy" | "error" | "info";
  message: string;
};

export type RoutogramFlowNodeData = {
  label: ReactNode;
  health: HealthLevel;
  diagnostics: GraphNodeIssue[];
  issueCount: number;
  childCount: number;
  hasOutgoing: boolean;
  isExpanded: boolean;
  hydration?: string | null;
  onSelect: () => void;
  onToggle: () => void;
};

export type RoutogramFlowNodeType = Node<RoutogramFlowNodeData, "routogram">;

export function RoutogramFlowNode({ id, data }: NodeProps<RoutogramFlowNodeType>) {
  const hasChildren = data.childCount > 0;
  const hasSource = hasChildren || data.hasOutgoing;

  return (
    <>
      <Handle type="target" position={Position.Left} className="routogram-node-target" />

      <div className="routogram-node-enter">{data.label}</div>

      <NodeHealthBadge
        health={data.health}
        diagnostics={data.diagnostics}
        issueCount={data.issueCount}
        onSelect={data.onSelect}
      />

      {data.hydration ? (
        <span
          className={`routogram-hydration-dot pointer-events-none absolute bottom-2 left-2 z-20 size-1.5 rounded-full ${hydrationClass(data.hydration)}`}
          title={`Hydration: ${data.hydration}`}
        />
      ) : null}

      {hasChildren ? (
        <div className="nodrag nopan absolute right-0 top-1/2 z-30 -translate-y-1/2 translate-x-1/2">
          <Handle
            type="source"
            position={Position.Right}
            className="routogram-node-toggle-handle pointer-events-none !absolute !inset-0 !m-0 !h-full !w-full !border-0 !bg-transparent !opacity-0"
            style={{
              inset: 0,
              width: "100%",
              height: "100%",
              transform: "none",
            }}
          />
          <button
            type="button"
            title={data.isExpanded ? "Collapse branch" : `Expand ${data.childCount} nodes`}
            aria-label={data.isExpanded ? "Collapse branch" : `Expand ${data.childCount} nodes`}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseEnter={(event) => {
              event.stopPropagation();
            }}
            onPointerEnter={(event) => {
              event.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("routogram:toggle-hover", {
                  detail: { nodeId: id, hovered: true },
                }),
              );
            }}
            onPointerLeave={() => {
              window.dispatchEvent(
                new CustomEvent("routogram:toggle-hover", {
                  detail: { nodeId: id, hovered: false },
                }),
              );
            }}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle();
            }}
            className={`routogram-node-toggle relative z-10 flex cursor-pointer select-none items-center justify-center rounded-full shadow-md transition-all duration-150 active:scale-95 ${
              data.isExpanded
                ? "h-4 w-4 border border-zinc-600 bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                : "h-5 min-w-[22px] bg-sky-600 px-1.5 text-[11px] font-bold text-white shadow-sky-500/20 hover:bg-sky-500"
            }`}
          >
            {data.isExpanded ? (
              <span className="block h-0.5 w-2 rounded-full bg-current" />
            ) : (
              <span className="block leading-none tabular-nums">+{data.childCount}</span>
            )}
          </button>
        </div>
      ) : hasSource ? (
        <Handle type="source" position={Position.Right} className="routogram-node-source" />
      ) : null}
    </>
  );
}

function hydrationClass(hydration: string): string {
  if (hydration.includes("load")) return "bg-cyan-400 shadow-[0_0_8px_#22d3ee]";
  if (hydration.includes("visible")) return "bg-emerald-400 shadow-[0_0_8px_#34d399]";
  if (hydration.includes("idle")) return "bg-amber-400 shadow-[0_0_8px_#fbbf24]";
  return "bg-zinc-400 shadow-[0_0_8px_#a1a1aa]";
}

function NodeHealthBadge({
  health,
  diagnostics,
  issueCount,
  onSelect,
}: {
  health: HealthLevel;
  diagnostics: GraphNodeIssue[];
  issueCount: number;
  onSelect: () => void;
}) {
  const details = diagnostics
    .slice(0, 5)
    .map((diagnostic) => `[${diagnostic.severity}] ${diagnostic.message}`)
    .join("\n");
  const title = issueCount > 0 ? `${issueCount} issue(s)\n${details}` : "No code-health issues";

  if (health === "safe") {
    return (
      <span
        title={title}
        className="nodrag nopan absolute top-2.5 right-2.5 z-20 grid size-4 place-items-center rounded-full bg-emerald-400/10 text-emerald-400"
      >
        <Check className="size-2.5" strokeWidth={2.5} />
      </span>
    );
  }

  const Icon = health === "tidy" ? Info : AlertTriangle;
  const color =
    health === "danger"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-400/70 hover:border-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
      : health === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400/70 hover:border-amber-400 hover:bg-amber-500/15 hover:text-amber-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-400/70 hover:border-sky-400 hover:text-sky-300";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`nodrag nopan absolute top-2.5 right-2.5 z-20 flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full border px-1 font-mono text-[8px] font-semibold transition-all duration-200 ease-out ${color}`}
    >
      <Icon className="size-2.5" />
      {issueCount > 0 ? issueCount : null}
    </button>
  );
}
