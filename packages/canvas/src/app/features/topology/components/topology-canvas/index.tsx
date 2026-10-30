import type { HealthLevel, NodeHealthData } from "@routogram/plugin-core";
import {
  type DiagnosticsUpdatedPayload,
  ROUTOGRAM_LAYER_META,
  type RoutogramEdge,
  type RoutogramNode,
  type RoutogramNodeLayer,
  type RoutogramRuntimeSnapshot,
  type RoutogramTopologyDiff,
} from "@routogram/types";
import {
  Background,
  BackgroundVariant,
  Controls,
  type DefaultEdgeOptions,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  NodePositionsContext,
  RoutogramEdge as RoutogramFlowEdge,
} from "@/components/edges/routogram-edge";
import { RoutogramFlowNode } from "@/components/nodes/routogram-flow-node";
import { getCachedDiagnostics } from "@/lib/apis";
import { FRAMEWORK_BADGE_CONFIG } from "@/lib/constants/framework-badges";
import { computeNodeBlastRadius, setBlastRadiusGraph } from "@/lib/utils/blast-radius";
import { normalizeUIFramework } from "@/lib/utils/detect-framework";
import { formatComponentName } from "@/lib/utils/format-name";
import { getAncestorPath } from "@/lib/utils/graph-path";
import { resolveIslandVisual } from "@/lib/utils/island-framework";
import { findRuntimeComponent, runtimeHeatColor } from "@/lib/utils/runtime";
import type { TopologyView } from "@/lib/utils/topology-view";
import {
  type LayoutPositions,
  NODE_HEIGHT,
  NODE_WIDTH,
  useElkLayout,
} from "../../hooks/use-elk-layout";
import type { FocusRequest } from "../../types/topology";
import { RuntimeOverlay } from "../runtime-overlay";

const LAYER_COLUMN: Record<RoutogramNodeLayer, number> = {
  macro: 0,
  meso: 1,
  micro: 2,
  boundary: 3,
};

const NODE_TYPES = { routogram: RoutogramFlowNode };
const EDGE_TYPES = { step: RoutogramFlowEdge };

const HEALTH_META: Record<
  HealthLevel,
  { border: string; glow: string; dot: string; background?: string }
> = {
  safe: {
    border: "rgba(16, 185, 129, 0.25)",
    glow: "0 0 12px rgba(16, 185, 129, 0.1)",
    dot: "#10b981",
    background: "#0e0e12",
  },
  tidy: {
    border: "rgba(14, 165, 233, 0.25)",
    glow: "0 0 12px rgba(14, 165, 233, 0.12)",
    dot: "#0ea5e9",
    background: "#0e0e12",
  },
  warning: {
    border: "rgba(245, 158, 11, 0.30)",
    glow: "0 0 12px rgba(245, 158, 11, 0.12)",
    dot: "#f59e0b",
    background: "#0e0e12",
  },
  danger: {
    border: "rgba(244, 63, 94, 0.35)",
    glow: "0 0 18px rgba(244, 63, 94, 0.22)",
    dot: "#f43f5e",
    background: "#151014",
  },
};

function worstHealth(base: HealthLevel, diagnostics: readonly { severity: string }[]): HealthLevel {
  if (base === "danger") return "danger";
  if (
    diagnostics.some(
      (diagnostic) => diagnostic.severity === "danger" || diagnostic.severity === "error",
    )
  ) {
    return "danger";
  }
  if (base === "warning" || diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "warning";
  }
  return base;
}

export type TopologyCanvasProps = {
  view: TopologyView;
  expandedNodeIds: Set<string>;
  highlightedNodeIds: string[] | null;
  focusRequest: FocusRequest | null;
  runtime: RoutogramRuntimeSnapshot | null;
  timelineDiff: RoutogramTopologyDiff | null;
  layoutEnabled: boolean;
  onToggleRoot: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  healthByNode: Record<string, NodeHealthData>;
  selectedNodeId: string | null;
  hoveredStoreName: string | null;
  onNodeClick: NodeMouseHandler;
  onPaneClick: () => void;
  simulationMode: boolean;
  remoteViewport: { x: number; y: number; zoom: number } | null;
  onViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
};

export function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function TopologyCanvasInner({
  view,
  expandedNodeIds,
  highlightedNodeIds,
  focusRequest,
  runtime,
  timelineDiff,
  layoutEnabled,
  onToggleRoot,
  onSelectNode,
  healthByNode,
  selectedNodeId,
  hoveredStoreName,
  onNodeClick,
  onPaneClick,
  simulationMode,
  remoteViewport,
  onViewportChange,
}: TopologyCanvasProps) {
  const { fitView, getNode, getViewport, setViewport } = useReactFlow();
  const layout = useElkLayout(view.nodes, view.edges, layoutEnabled);
  const focusTargetRef = useRef<string[] | null>(null);
  const pendingAnchorRef = useRef<{
    nodeId: string;
    oldPosition: { x: number; y: number };
    viewport: Viewport;
    sawLayoutRun: boolean;
  } | null>(null);
  // During a layout run, keep newly expanded nodes hidden until ELK assigns
  // positions. This prevents temporary overlap with existing branches.
  // Trong lúc layout chạy, ẩn node mới cho đến khi ELK gán vị trí để tránh đè.
  const positionedView = useMemo(() => {
    if (!layout.running) {
      return view;
    }
    const positionedNodes = view.nodes.filter((node) => layout.positions[node.id]);
    if (positionedNodes.length === view.nodes.length) {
      return view;
    }
    const ids = new Set(positionedNodes.map((node) => node.id));
    return {
      ...view,
      nodes: positionedNodes,
      edges: view.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  }, [layout.positions, layout.running, view]);
  const layoutPositionsRef = useRef<LayoutPositions>(layout.positions);
  layoutPositionsRef.current = layout.positions;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    buildFlowNodes(
      positionedView,
      highlightedNodeIds,
      expandedNodeIds,
      layout.positions,
      onToggleRoot,
      onSelectNode,
      healthByNode,
      runtime,
      timelineDiff,
    ),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    buildFlowEdges(positionedView.edges, highlightedNodeIds),
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  const applyHighlight = useCallback(
    (nodeId: string | null) => {
      const root = canvasRef.current;
      if (!root) {
        return;
      }

      root.dataset.activeTargetId = nodeId ?? "";
      root.dataset.hoveredId = hoveredIdRef.current ?? "";

      const nodeElements = root.querySelectorAll<HTMLElement>(".react-flow__node");
      const edgeElements = root.querySelectorAll<HTMLElement>(".react-flow__edge");

      if (!nodeId) {
        nodeElements.forEach((element) => {
          element.classList.remove(
            "routogram-hover-target",
            "routogram-hover-ancestor",
            "routogram-hover-off",
          );
        });
        edgeElements.forEach((element) => {
          element.classList.remove("routogram-hover-path", "routogram-hover-off");
        });
        return;
      }

      const path = getAncestorPath(nodeId, view.edges);
      nodeElements.forEach((element) => {
        const id = element.getAttribute("data-id");
        element.classList.toggle("routogram-hover-target", id === nodeId);
        element.classList.toggle(
          "routogram-hover-ancestor",
          id !== nodeId && path.nodeIds.has(id ?? ""),
        );
        element.classList.toggle(
          "routogram-hover-off",
          id !== nodeId && !path.nodeIds.has(id ?? ""),
        );
      });
      edgeElements.forEach((element) => {
        const id = element.getAttribute("data-id") ?? "";
        element.classList.toggle("routogram-hover-path", path.edgeIds.has(id));
        element.classList.toggle("routogram-hover-off", !path.edgeIds.has(id));
      });
    },
    [view.edges],
  );

  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.target instanceof Element && event.target.closest(".routogram-node-toggle")) {
        return;
      }
      if (selectedNodeId) {
        return;
      }
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (hoveredIdRef.current === node.id) {
        return;
      }
      hoveredIdRef.current = node.id;
      applyHighlight(node.id);
    },
    [applyHighlight, selectedNodeId],
  );

  const handleNodeMouseLeave = useCallback(() => {
    if (selectedNodeId) {
      return;
    }
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      hoveredIdRef.current = null;
      applyHighlight(selectedNodeId);
      hoverTimeoutRef.current = null;
    }, 50);
  }, [applyHighlight, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId) {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      hoveredIdRef.current = null;
      applyHighlight(selectedNodeId);
      return;
    }

    applyHighlight(hoveredIdRef.current);
  }, [applyHighlight, selectedNodeId]);

  useEffect(() => {
    setBlastRadiusGraph(view.nodes, view.edges);
  }, [view.nodes, view.edges]);

  useEffect(() => {
    const root = canvasRef.current;
    if (!root) return;

    const nodeElements = root.querySelectorAll<HTMLElement>(".react-flow__node");
    for (const element of nodeElements) {
      element.classList.remove("routogram-blast-affected");
    }
    if (!selectedNodeId) return;

    const blast = computeNodeBlastRadius(selectedNodeId, view.nodes, view.edges);
    const affected = new Set(blast.upstreamIds);
    for (const element of nodeElements) {
      if (affected.has(element.getAttribute("data-id") ?? "")) {
        element.classList.add("routogram-blast-affected");
      }
    }

    return () => {
      for (const element of nodeElements) {
        element.classList.remove("routogram-blast-affected");
      }
    };
  }, [selectedNodeId, view.edges, view.nodes]);

  useEffect(() => {
    const handleToggleHover = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: unknown; hovered?: unknown }>).detail;
      if (!detail || typeof detail.nodeId !== "string" || typeof detail.hovered !== "boolean") {
        return;
      }

      if (selectedNodeId) {
        return;
      }

      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      if (detail.hovered) {
        hoveredIdRef.current = null;
        applyHighlight(null);
        return;
      }

      hoveredIdRef.current = detail.nodeId;
      applyHighlight(detail.nodeId);
    };

    window.addEventListener("routogram:toggle-hover", handleToggleHover);
    return () => window.removeEventListener("routogram:toggle-hover", handleToggleHover);
  }, [applyHighlight, selectedNodeId]);

  useEffect(() => {
    if (hoveredIdRef.current && !view.nodes.some((node) => node.id === hoveredIdRef.current)) {
      hoveredIdRef.current = null;
      applyHighlight(selectedNodeId);
    }
  }, [applyHighlight, selectedNodeId, view.nodes]);

  useEffect(() => {
    const root = canvasRef.current;
    if (!root) {
      return;
    }

    const nodeElements = root.querySelectorAll<HTMLElement>(".react-flow__node");
    const edgeElements = root.querySelectorAll<HTMLElement>(".react-flow__edge");
    if (!hoveredStoreName) {
      nodeElements.forEach((element) => {
        element.classList.remove("routogram-store-match", "routogram-store-off");
      });
      edgeElements.forEach((element) => {
        element.classList.remove("routogram-store-off");
      });
      return;
    }

    const matchingIds = new Set(
      view.nodes
        .filter((node) => node.meta?.usedStores?.includes(hoveredStoreName))
        .map((node) => node.id),
    );

    nodeElements.forEach((element) => {
      const id = element.getAttribute("data-id") ?? "";
      element.classList.toggle("routogram-store-match", matchingIds.has(id));
      element.classList.toggle("routogram-store-off", !matchingIds.has(id));
    });

    edgeElements.forEach((element) => {
      const id = element.getAttribute("data-id") ?? "";
      const edge = view.edges.find((candidate) => candidate.id === id);
      const related =
        edge !== undefined && matchingIds.has(edge.source) && matchingIds.has(edge.target);
      element.classList.toggle("routogram-store-off", !related);
    });

    return () => {
      nodeElements.forEach((element) => {
        element.classList.remove("routogram-store-match", "routogram-store-off");
      });
      edgeElements.forEach((element) => {
        element.classList.remove("routogram-store-off");
      });
    };
  }, [hoveredStoreName, view.nodes, view.edges]);

  useEffect(
    () => () => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const pending = pendingAnchorRef.current;
    if (!pending) {
      return;
    }

    if (layout.running) {
      pending.sawLayoutRun = true;
      return;
    }
    if (!pending.sawLayoutRun) {
      return;
    }

    const nextPosition = layout.positions[pending.nodeId];
    pendingAnchorRef.current = null;
    if (!nextPosition) {
      return;
    }

    const deltaX = nextPosition.x - pending.oldPosition.x;
    const deltaY = nextPosition.y - pending.oldPosition.y;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const nextViewport = {
      x: pending.viewport.x - deltaX * pending.viewport.zoom,
      y: pending.viewport.y - deltaY * pending.viewport.zoom,
      zoom: pending.viewport.zoom,
    };

    const frame = requestAnimationFrame(() => {
      void setViewport(nextViewport, { duration: 250 });
    });

    return () => cancelAnimationFrame(frame);
  }, [layout.positions, layout.running, setViewport]);

  useEffect(() => {
    if (focusRequest) {
      focusTargetRef.current = focusRequest.nodeIds;
    }

    const targetIds = focusTargetRef.current;
    if (!targetIds || layout.running) {
      return;
    }

    const timer = window.setTimeout(() => {
      const targets = nodes.filter((node) => targetIds.includes(node.id));

      if (targets.length === 0) {
        focusTargetRef.current = null;
        return;
      }

      focusTargetRef.current = null;
      void fitView({ nodes: targets, padding: 0.65, duration: 450, maxZoom: 1.3 });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [fitView, focusRequest, layout.running, nodes]);
  useEffect(() => {
    if (remoteViewport) {
      void setViewport(remoteViewport, { duration: 300 });
    }
  }, [remoteViewport, setViewport]);

  useEffect(() => {
    const handleDiagnosticsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        typeof detail !== "object" ||
        detail === null ||
        !("nodes" in detail) ||
        typeof (detail as { nodes?: unknown }).nodes !== "object"
      ) {
        return;
      }
      const payload = detail as DiagnosticsUpdatedPayload;
      setNodes((current) =>
        current.map((node) => {
          const external = payload.nodes[node.id]?.diagnostics ?? [];
          const core = healthByNode[node.id]?.diagnostics ?? [];
          const health = worstHealth(healthByNode[node.id]?.health ?? "safe", external);
          const diagnostics = [
            ...core.map((diagnostic) => ({
              id: diagnostic.id,
              severity: diagnostic.severity,
              message: diagnostic.message,
            })),
            ...external.map((diagnostic) => ({
              id: diagnostic.id,
              severity: diagnostic.severity,
              message: diagnostic.message,
            })),
          ];
          if (node.data.health === health && node.data.issueCount === diagnostics.length) {
            return node;
          }
          const classNames = (node.className ?? "")
            .split(" ")
            .filter((name) => name && !name.startsWith("routogram-health-"));
          classNames.push(`routogram-health-${health}`);
          return {
            ...node,
            className: classNames.join(" "),
            data: {
              ...node.data,
              health,
              diagnostics,
              issueCount: diagnostics.length,
            },
          };
        }),
      );
    };

    window.addEventListener("routogram:diagnostics-updated", handleDiagnosticsUpdated);
    return () =>
      window.removeEventListener("routogram:diagnostics-updated", handleDiagnosticsUpdated);
  }, [healthByNode, setNodes]);

  const zoom = useStore((state) => state.transform[2]);
  const lod = zoom < 0.4 ? "minimal" : zoom < 0.7 ? "compact" : "full";

  const handleToggle = useCallback(
    (nodeId: string) => {
      // Anchor the clicked node in place while ELK recalculates the tree.
      const target = getNode(nodeId);
      if (target) {
        pendingAnchorRef.current = {
          nodeId,
          oldPosition: { ...target.position },
          viewport: getViewport(),
          sawLayoutRun: false,
        };
      }
      onToggleRoot(nodeId);
    },
    [getNode, getViewport, onToggleRoot],
  );

  useEffect(() => {
    setNodes(
      buildFlowNodes(
        positionedView,
        highlightedNodeIds,
        expandedNodeIds,
        layoutPositionsRef.current,
        handleToggle,
        onSelectNode,
        healthByNode,
        runtime,
        timelineDiff,
      ),
    );
    setEdges(buildFlowEdges(positionedView.edges, highlightedNodeIds));
  }, [
    expandedNodeIds,
    handleToggle,
    healthByNode,
    highlightedNodeIds,
    onSelectNode,
    runtime,
    setEdges,
    setNodes,
    timelineDiff,
    positionedView,
  ]);

  const nodePositions = useMemo(
    () =>
      Object.fromEntries(
        nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
      ),
    [nodes],
  );

  const handleNodeDoubleClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if ((view.childCounts.get(node.id) ?? 0) > 0) {
        handleToggle(node.id);
      }
    },
    [handleToggle, view.childCounts],
  );

  return (
    <div
      ref={canvasRef}
      data-hovered-id=""
      className={`relative h-full w-full pointer-events-auto ${
        simulationMode ? "shadow-[inset_0_0_0_1px_rgb(251_191_36/0.35)]" : ""
      }`}
    >
      <RuntimeOverlay runtime={runtime} />

      <NodePositionsContext.Provider value={nodePositions}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onPaneClick={onPaneClick}
          onMoveEnd={(_event, viewport) => onViewportChange(viewport)}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          defaultEdgeOptions={
            {
              type: "step",
              pathOptions: { borderRadius: 0 },
            } as DefaultEdgeOptions
          }
          onlyRenderVisibleElements={false}
          minZoom={0.05}
          maxZoom={2}
          colorMode="dark"
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          className={`bg-(--rg-canvas) routogram-lod-${lod}`}
        >
          <Background color="#1e293b" gap={22} size={1} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-left" showInteractive={false} className="z-20! m-4!" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor="#334155"
            maskColor="rgb(7 8 11 / 0.72)"
            className="h-28! w-44!"
          />
        </ReactFlow>
      </NodePositionsContext.Provider>

      {layout.running ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] text-sky-200 backdrop-blur">
          Laying out subgraph…
        </div>
      ) : null}

      {layout.error ? (
        <div className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[10px] text-rose-200 backdrop-blur">
          Layout fallback: {layout.error}
        </div>
      ) : null}
    </div>
  );
}

function buildFlowNodes(
  view: TopologyView,
  highlightedNodeIds: string[] | null,
  expandedNodeIds: Set<string>,
  positions: LayoutPositions,
  onToggleRoot: (nodeId: string) => void,
  onSelectNode: (nodeId: string) => void,
  healthByNode: Record<string, NodeHealthData>,
  runtime: RoutogramRuntimeSnapshot | null,
  timelineDiff: RoutogramTopologyDiff | null,
): Node[] {
  const layerCounts = new Map<RoutogramNodeLayer, number>();
  const highlighted =
    highlightedNodeIds && highlightedNodeIds.length > 0 ? new Set(highlightedNodeIds) : null;
  const visibleIds = new Set(view.nodes.map((node) => node.id));

  const flowNodes = view.nodes.map((node) => {
    const row = layerCounts.get(node.layer) ?? 0;
    layerCounts.set(node.layer, row + 1);
    const layerMeta = ROUTOGRAM_LAYER_META[node.layer];
    const typeLabel = nodeTypeLabel(node);
    const islandTarget = view.edges.find(
      (edge) => edge.source === node.id && edge.kind === "renders",
    );
    const islandTargetFile = islandTarget
      ? view.nodes.find((candidate) => candidate.id === islandTarget.target)?.file
      : undefined;
    const islandVisual = resolveIslandVisual(node, islandTargetFile);
    const framework = islandVisual?.framework ?? normalizeUIFramework(node.framework);
    const frameworkBadge =
      islandVisual ||
      node.kind === "component" ||
      node.kind === "ui_component" ||
      node.kind === "route" ||
      node.kind === "layout" ||
      node.kind === "backend_route" ||
      node.kind === "controller"
        ? FRAMEWORK_BADGE_CONFIG[framework]
        : null;
    const isHighlighted = highlighted?.has(node.id) ?? false;
    const dimmed = highlighted !== null && !isHighlighted;
    const childCount = view.childCounts.get(node.id) ?? 0;
    const hasOutgoing = view.edges.some((edge) => edge.source === node.id);
    const isExpanded = expandedNodeIds.has(node.id);
    const runtimeComponent = findRuntimeComponent(node, runtime);
    const heatColor = runtimeComponent ? runtimeHeatColor(runtimeComponent) : null;
    const isActiveRoute = runtime !== null && node.route === runtime.route;
    const healthEntry = healthByNode[node.id];
    const cachedDiagnostics = getCachedDiagnostics(node.id);
    const health = worstHealth(healthEntry?.health ?? "safe", [
      ...(healthEntry?.diagnostics ?? []),
      ...cachedDiagnostics,
    ]);
    const healthMeta = HEALTH_META[health];
    const graphDiagnostics = [
      ...(healthEntry?.diagnostics ?? []).map((diagnostic) => ({
        id: diagnostic.id,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })),
      ...cachedDiagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        severity: diagnostic.severity,
        message: diagnostic.message,
      })),
    ];
    const issueCount = graphDiagnostics.length;
    const position = positions[node.id] ?? {
      x: LAYER_COLUMN[node.layer] * 300,
      y: row * 120,
    };

    return {
      id: node.id,
      type: "routogram",
      position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        health,
        framework,
        hydration: islandVisual?.hydration ?? null,
        usedStores: node.meta?.usedStores ?? [],
        props: node.meta?.props ?? [],
        diagnostics: graphDiagnostics,
        issueCount,
        childCount,
        hasOutgoing,
        isExpanded,
        onSelect: () => onSelectNode(node.id),
        onToggle: () => onToggleRoot(node.id),
        label: (
          <div className="text-left">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wider text-zinc-300 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-colors">
                  {typeLabel}
                </span>
                {frameworkBadge ? (
                  <span
                    className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider ${frameworkBadge.className}`}
                    title={`Framework: ${frameworkBadge.label}`}
                  >
                    {frameworkBadge.label}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="block truncate text-[13px] font-semibold text-zinc-100"
                title={node.name}
              >
                {formatComponentName(node.name)}
              </span>
            </div>
            {node.kind === "layout" || node.file.endsWith("/layout.tsx") ? (
              <div
                className="routogram-node-secondary mt-1 truncate font-mono text-[10px] text-zinc-500"
                title={node.file}
              >
                {node.file}
              </div>
            ) : null}
            {runtimeComponent ? (
              <div className="routogram-node-secondary mt-0.5 font-mono text-[9px] text-slate-500">
                {runtimeComponent.renderCount} renders · {runtimeComponent.recentRenders} recent
              </div>
            ) : null}
          </div>
        ),
      },
      className: [`routogram-health-${health}`, isActiveRoute ? "routogram-runtime-active" : ""]
        .filter(Boolean)
        .join(" "),
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        padding: "10px 12px",
        borderRadius: 12,
        border: `2px solid ${healthMeta.border}`,
        background: healthMeta.background ?? "#0e0e12",
        boxShadow: [
          healthMeta.glow,
          isHighlighted ? `0 0 0 1px ${layerMeta.accent}aa` : null,
          heatColor ? `0 0 22px ${heatColor}44` : null,
          isActiveRoute ? "0 0 30px rgb(56 189 248 / 0.45)" : null,
          "0 12px 32px rgb(0 0 0 / 0.28)",
        ]
          .filter(Boolean)
          .join(", "),
        color: "#e2e8f0",
        zIndex: 10,
        opacity: dimmed ? 0.2 : 1,
        transition:
          "transform 400ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
      },
    };
  });

  const ghostNodes = (timelineDiff?.removedNodes ?? [])
    .filter((ghost) => !visibleIds.has(ghost.id))
    .map((ghost, index) => ({
      id: `timeline-removed:${ghost.id}`,
      position: { x: 320, y: 640 + index * 110 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div className="text-left opacity-80">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-300">
              Removed
            </div>
            <div className="mt-1 text-[13px] text-rose-100">{ghost.name}</div>
          </div>
        ),
      },
      draggable: false,
      selectable: false,
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        padding: "10px 12px",
        borderRadius: 12,
        border: "2px dashed #fb7185",
        background: "#161014",
        color: "#fecdd3",
        opacity: 0.45,
      },
    }));

  return [...flowNodes, ...ghostNodes];
}

function nodeTypeLabel(node: RoutogramNode): string {
  if (node.kind === "route") {
    return "Page";
  }
  if (node.kind === "layout") {
    return "Layout";
  }
  if (node.kind === "component" || node.kind === "ui_component") {
    return "Component";
  }
  if (node.kind === "hook" || node.kind === "composable") {
    return "Composable";
  }
  if (node.kind === "backend_route") {
    return "Backend Route";
  }
  if (node.kind === "controller") {
    return "Controller";
  }
  if (node.kind === "island") {
    return "Island";
  }
  if (node.kind === "middleware") {
    return "Middleware";
  }
  if (node.kind === "server_action") {
    return "Server Action";
  }
  if (node.kind === "api_endpoint") {
    return "API Route";
  }
  if (node.kind === "api_client") {
    return "API Client";
  }
  if (node.kind === "style") {
    return "Stylesheet";
  }
  if (node.kind === "token") {
    return "Token";
  }

  return ROUTOGRAM_LAYER_META[node.layer].label;
}

function buildFlowEdges(edges: RoutogramEdge[], highlightedNodeIds: string[] | null): Edge[] {
  const highlighted =
    highlightedNodeIds && highlightedNodeIds.length > 0 ? new Set(highlightedNodeIds) : null;
  const color = "#52525b";

  return edges.map((edge) => {
    const connected =
      highlighted === null || highlighted.has(edge.source) || highlighted.has(edge.target);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "step",
      animated: edge.kind === "dynamic_imports",
      style: {
        stroke: color,
        strokeWidth: 1.5,
        opacity: connected ? 0.8 : 0.12,
        transition: "d 400ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease",
        strokeDasharray: edge.kind === "dynamic_imports" ? "4 4" : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    };
  });
}
