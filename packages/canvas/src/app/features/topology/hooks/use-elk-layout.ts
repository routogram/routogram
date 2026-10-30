import type { RoutogramEdge, RoutogramNode } from "@routogram/types";
import type { ELK as ElkInstance } from "elkjs/lib/elk-api.js";
import ELK from "elkjs/lib/elk-api.js";
import { useEffect, useRef, useState } from "react";

export type LayoutPosition = {
  x: number;
  y: number;
};

export type LayoutPositions = Record<string, LayoutPosition>;

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 96;

// The main thread only serializes the graph; ELK computes in the worker.
// Main thread chỉ tuần tự hóa đồ thị; ELK tính toán trong worker.
export function useElkLayout(
  nodes: RoutogramNode[],
  edges: RoutogramEdge[],
  enabled = true,
): { positions: LayoutPositions; running: boolean; error: string | null } {
  const workerRef = useRef<Worker | null>(null);
  const elkRef = useRef<ElkInstance | null>(null);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef(0);
  const graphKeyRef = useRef("");
  const [positions, setPositions] = useState<LayoutPositions>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const graphKey = `${nodes.map((node) => node.id).join("|")}::${edges
    .map((edge) => edge.id)
    .join("|")}`;
  graphKeyRef.current = graphKey;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const worker = new Worker(new URL("../workers/elk.worker.ts", import.meta.url), {
      type: "module",
    });
    const elk = new ELK({
      workerFactory: () => worker,
    });

    workerRef.current = worker;
    elkRef.current = elk;

    return () => {
      worker.terminate();
      workerRef.current = null;
      elkRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      setRunning(false);
      setPositions({});
      return;
    }

    const elk = elkRef.current;
    if (!elk) {
      return;
    }

    let cancelled = false;
    const id = ++requestIdRef.current;
    const requestGraphKey = graphKeyRef.current;
    activeRequestRef.current = id;
    setRunning(true);
    setError(null);

    elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.spacing.nodeNode": "48",
          "elk.layered.spacing.nodeNodeBetweenLayers": "100",
          "elk.spacing.edgeNode": "32",
          "elk.spacing.edgeEdge": "16",
          "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
          "elk.layered.spacing.edgeNodeBetweenLayers": "32",
          "elk.layered.mergeEdges": "true",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
          "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          "elk.padding": "[top=50,left=50,bottom=50,right=50]",
        },
        children: nodes.map((node) => ({
          id: node.id,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
      })
      .then((layout) => {
        if (
          cancelled ||
          id !== activeRequestRef.current ||
          requestGraphKey !== graphKeyRef.current
        ) {
          return;
        }

        const next: LayoutPositions = {};
        for (const child of layout.children ?? []) {
          next[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
        }
        setPositions(next);
        setRunning(false);
      })
      .catch((layoutError: unknown) => {
        if (
          cancelled ||
          id !== activeRequestRef.current ||
          requestGraphKey !== graphKeyRef.current
        ) {
          return;
        }

        setRunning(false);
        setError(layoutError instanceof Error ? layoutError.message : String(layoutError));
      });

    return () => {
      cancelled = true;
    };
  }, [edges, enabled, nodes]);

  return { positions, running, error };
}
