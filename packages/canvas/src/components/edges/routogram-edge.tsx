import { BaseEdge, type Edge, type EdgeProps, getSmoothStepPath, Position } from "@xyflow/react";
import { createContext, useContext } from "react";

import { NODE_HEIGHT, NODE_WIDTH } from "@/app/features/topology/hooks/use-elk-layout";

export type NodePosition = { x: number; y: number };

export const NodePositionsContext = createContext<Record<string, NodePosition>>({});

export type RoutogramEdgeType = EdgeProps<Edge<Record<string, unknown>, "smoothstep">>;

export function RoutogramEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
}: RoutogramEdgeType) {
  const positions = useContext(NodePositionsContext);
  const sourcePosition = positions[source];
  const targetPosition = positions[target];

  const [path] = getSmoothStepPath({
    sourceX: sourcePosition ? sourcePosition.x + NODE_WIDTH : sourceX,
    sourceY: sourcePosition ? sourcePosition.y + NODE_HEIGHT / 2 : sourceY,
    targetX: targetPosition ? targetPosition.x : targetX,
    targetY: targetPosition ? targetPosition.y + NODE_HEIGHT / 2 : targetY,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    borderRadius: 0,
  });

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}
