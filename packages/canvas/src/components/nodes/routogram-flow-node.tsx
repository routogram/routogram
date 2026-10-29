import type { Diagnostic, HealthLevel } from "@routogram/plugin-core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { ReactNode } from "react";

export type RoutogramFlowNodeData = {
  label: ReactNode;
  health: HealthLevel;
  diagnostics: Diagnostic[];
  childCount: number;
  hasOutgoing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

export type RoutogramFlowNodeType = Node<RoutogramFlowNodeData, "routogram">;

export function RoutogramFlowNode({ data }: NodeProps<RoutogramFlowNodeType>) {
  const hasChildren = data.childCount > 0;
  const hasSource = hasChildren || data.hasOutgoing;

  return (
    <>
      <Handle type="target" position={Position.Left} className="routogram-node-target" />

      {data.label}

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
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle();
            }}
            className={`relative z-10 flex cursor-pointer select-none items-center justify-center rounded-full shadow-md transition-all duration-150 active:scale-95 ${
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
