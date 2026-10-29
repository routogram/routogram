import type { NodeHealthData } from "@routogram/plugin-core";
import type { NodeMouseHandler } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiSidebar } from "@/components/ai-sidebar";
import { OverviewPlaceholder } from "@/components/overview-placeholder";
import { TopBar } from "@/components/top-bar";
import { AppShell, type AppTab } from "@/layouts/app-shell";
import { type FederatedTopology, fetchCodeHealth, fetchFederation, openInEditor } from "@/lib/apis";
import { buildTopologyView, getRootNodeIds } from "@/lib/utils/topology-view";
import { CollaborationStatus } from "./components/collaboration-status";
import { CollaboratorCursors } from "./components/collaborator-cursors";
import { DriftBanner } from "./components/drift-banner";
import { FederatedSwitcher } from "./components/federated-switcher";
import { InspectorDrawer } from "./components/inspector-drawer";
import { StoresPanel } from "./components/stores-panel";
import { TopologyCanvas } from "./components/topology-canvas";
import { TopologyToolbar } from "./components/topology-toolbar";
import { useCollaboration } from "./hooks/use-collaboration";
import { useTopology } from "./hooks/use-topology";
import type { ConnectionStatus } from "./types/topology";

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting", dot: "bg-amber-400" },
  online: { label: "Live", dot: "bg-emerald-400" },
  offline: { label: "Offline", dot: "bg-rose-500" },
  static: { label: "Static", dot: "bg-sky-400" },
};

type TopologyShellProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  isChatOpen: boolean;
  onChatOpen: () => void;
  onChatClose: () => void;
};

export default function TopologyShell({
  activeTab,
  onTabChange,
  isChatOpen,
  onChatOpen,
  onChatClose,
}: TopologyShellProps) {
  const { topology, status, isStatic, focusRequest, runtimeSnapshot, driftFindings, clearDrift } =
    useTopology();
  const collaboration = useCollaboration(!isStatic);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[] | null>(null);
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(() => new Set());
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const [autoExpandAll, setAutoExpandAll] = useState(true);
  const [federation, setFederation] = useState<FederatedTopology | null>(null);
  const [activeFederatedApp, setActiveFederatedApp] = useState<string | null>(null);
  const [healthByNode, setHealthByNode] = useState<Record<string, NodeHealthData>>({});
  const [hoveredStoreName, setHoveredStoreName] = useState<string | null>(null);

  const federatedTopology = useMemo(() => {
    if (!federation || !activeFederatedApp) {
      return null;
    }
    const nodes = federation.topology.nodes.filter(
      (node) => node.metadata?.appId === activeFederatedApp,
    );
    const ids = new Set(nodes.map((node) => node.id));
    return {
      ...federation.topology,
      nodes,
      edges: federation.topology.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [activeFederatedApp, federation]);

  const displayTopology = federatedTopology ?? topology;
  const selectedNode = useMemo(
    () => displayTopology?.nodes.find((node) => node.id === selectedId) ?? null,
    [displayTopology, selectedId],
  );
  const filteredTopology = displayTopology;
  const stores = useMemo(() => {
    const consumers = new Map<string, Set<string>>();
    for (const node of filteredTopology?.nodes ?? []) {
      for (const store of node.meta?.usedStores ?? []) {
        const ids = consumers.get(store) ?? new Set<string>();
        ids.add(node.id);
        consumers.set(store, ids);
      }
    }
    return [...consumers.entries()]
      .map(([name, ids]) => ({
        name,
        consumerCount: ids.size,
        nodeIds: [...ids],
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [filteredTopology]);
  const allRootIds = useMemo(
    () => new Set(filteredTopology ? getRootNodeIds(filteredTopology) : []),
    [filteredTopology],
  );
  const effectiveExpandedRootIds = autoExpandAll ? allRootIds : expandedRootIds;
  const view = useMemo(
    () =>
      filteredTopology
        ? buildTopologyView(filteredTopology, effectiveExpandedRootIds, collapsedNodeIds)
        : null,
    [collapsedNodeIds, effectiveExpandedRootIds, filteredTopology],
  );
  const statusMeta = STATUS_META[status];

  useEffect(() => {
    if (isStatic || !topology) {
      setHealthByNode({});
      return;
    }

    let cancelled = false;
    fetchCodeHealth()
      .then((report) => {
        if (!cancelled) {
          setHealthByNode(report.nodes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthByNode({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isStatic, topology]);

  useEffect(() => {
    if (isStatic) {
      return;
    }
    let cancelled = false;
    fetchFederation().then((next) => {
      if (!cancelled) {
        setFederation(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isStatic]);

  useEffect(() => {
    void activeFederatedApp;
    setSelectedId(null);
    setHighlightedNodeIds(null);
    setExpandedRootIds(new Set());
  }, [activeFederatedApp]);

  useEffect(() => {
    if (!filteredTopology) {
      return;
    }

    const rootIds = new Set(getRootNodeIds(filteredTopology));
    setExpandedRootIds((current) => {
      const next = new Set([...current].filter((rootId) => rootIds.has(rootId)));

      return next.size === current.size ? current : next;
    });
  }, [filteredTopology]);

  useEffect(() => {
    if (!filteredTopology || !highlightedNodeIds || highlightedNodeIds.length === 0) {
      return;
    }

    setExpandedRootIds(new Set(getRootNodeIds(filteredTopology)));
  }, [filteredTopology, highlightedNodeIds]);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    setHighlightedNodeIds(focusRequest.nodeIds.length > 0 ? focusRequest.nodeIds : null);

    if (focusRequest.nodeIds[0]) {
      setSelectedId(focusRequest.nodeIds[0]);
    }

    if (topology) {
      setExpandedRootIds(new Set(getRootNodeIds(topology)));
    }
  }, [focusRequest, topology]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setHighlightedNodeIds(null);
  }, []);

  const handlePaneClick = clearSelection;

  const handleNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    setSelectedId(node.id);
    setHighlightedNodeIds(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  const handleToggleRoot = useCallback(
    (nodeId: string) => {
      const isExpanded = view?.expandedNodeIds.has(nodeId) ?? false;

      if (autoExpandAll) {
        setAutoExpandAll(false);
        setExpandedRootIds(() => {
          const next = new Set(allRootIds);
          if (isExpanded) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
      } else {
        setExpandedRootIds((current) => {
          const next = new Set(current);
          if (isExpanded) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
      }

      setCollapsedNodeIds((current) => {
        const next = new Set(current);
        if (isExpanded) {
          next.add(nodeId);
        } else {
          next.delete(nodeId);
        }
        return next;
      });
    },
    [allRootIds, autoExpandAll, view],
  );

  const projectSegments = displayTopology?.root.split(/[\\/]/).filter(Boolean) ?? [];
  const projectName = projectSegments[projectSegments.length - 1] ?? "workspace";
  const searchNodes = (displayTopology?.nodes ?? []).map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    file: node.file,
  }));

  const handleSearchSelect = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setHighlightedNodeIds(null);
      onTabChange("routing");
    },
    [onTabChange],
  );

  const handleOpenEditor = useCallback(async () => {
    if (!selectedNode || isStatic) {
      return;
    }
    try {
      const result = await openInEditor({
        filePath: selectedNode.file,
        line: selectedNode.source?.line ?? 1,
        column: selectedNode.source?.column ?? 1,
      });
      window.location.assign(result.url);
    } catch {
      // The inspector surfaces editor errors when the daemon cannot open a file.
      // Inspector hiển thị lỗi editor khi daemon không mở được file.
    }
  }, [isStatic, selectedNode]);

  const handleCopySnapshot = useCallback(async () => {
    if (!displayTopology) {
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(displayTopology, null, 2));
  }, [displayTopology]);

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={onTabChange}
      projectName={projectName}
      statusLabel={statusMeta.label}
      statusDot={statusMeta.dot}
      version={displayTopology?.generator.version ?? "0.1.0"}
      topbar={
        <TopBar
          activeTab={activeTab}
          nodes={searchNodes}
          onSelectNode={handleSearchSelect}
          onOpenEditor={() => void handleOpenEditor()}
          onCopySnapshot={handleCopySnapshot}
          onToggleAi={onChatOpen}
          aiOpen={isChatOpen}
          editorDisabled={isStatic || !selectedNode}
          snapshotDisabled={!displayTopology}
        />
      }
      rightSidebar={!isStatic ? <AiSidebar isOpen={isChatOpen} onClose={onChatClose} /> : null}
    >
      {activeTab === "overview" ? (
        <OverviewPlaceholder projectName={projectName} />
      ) : (
        <div className="flex h-full min-h-0">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-3">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                <TopologyToolbar
                  filteredTopology={filteredTopology}
                  highlightedNodeIds={highlightedNodeIds}
                  onClearHighlight={() => setHighlightedNodeIds(null)}
                />
                <FederatedSwitcher
                  apps={federation?.apps ?? []}
                  activeApp={activeFederatedApp}
                  conflictCount={federation?.conflicts.length ?? 0}
                  onChange={setActiveFederatedApp}
                />
              </div>
              <CollaborationStatus
                peers={collaboration.peers}
                presenterId={collaboration.presenterId}
                isPresenter={collaboration.isPresenter}
                connected={collaboration.connected}
                onTogglePresenter={collaboration.togglePresenter}
              />
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <StoresPanel
                stores={stores}
                hoveredStoreName={hoveredStoreName}
                onHoverStore={setHoveredStoreName}
              />

              {topology && view ? (
                <TopologyCanvas
                  view={view}
                  expandedNodeIds={view.expandedNodeIds}
                  highlightedNodeIds={highlightedNodeIds}
                  focusRequest={focusRequest}
                  layoutEnabled={!isStatic}
                  runtime={runtimeSnapshot}
                  timelineDiff={null}
                  onToggleRoot={handleToggleRoot}
                  onSelectNode={setSelectedId}
                  healthByNode={healthByNode}
                  selectedNodeId={selectedId}
                  hoveredStoreName={hoveredStoreName}
                  onNodeClick={handleNodeClick}
                  onPaneClick={handlePaneClick}
                  simulationMode={false}
                  remoteViewport={collaboration.remoteViewport}
                  onViewportChange={collaboration.sendViewport}
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <div className="rounded-xl border border-(--rg-border) bg-(--rg-surface) px-6 py-5 text-center shadow-2xl">
                    <p className="text-sm font-medium text-slate-300">
                      {status === "offline" ? "Daemon unavailable" : "Connecting to daemon"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {status === "offline"
                        ? "Start the local daemon with pnpm dev:cli"
                        : "Waiting for the first topology snapshot"}
                    </p>
                  </div>
                </div>
              )}

              {!isStatic ? <DriftBanner findings={driftFindings} onDismiss={clearDrift} /> : null}

              <CollaboratorCursors
                peers={collaboration.peers}
                connected={collaboration.connected}
              />

              {view && !autoExpandAll && expandedRootIds.size === 0 && view.rootIds.size > 0 ? (
                <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-(--rg-surface)/90 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur">
                  Macro view · expand a root node to load its component subtree
                </div>
              ) : null}

              {status === "offline" && topology ? (
                <div className="pointer-events-none absolute inset-x-0 top-4 z-10 mx-auto w-fit rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200 backdrop-blur">
                  Daemon offline — showing the last topology snapshot
                </div>
              ) : null}

              {selectedNode ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="Close inspector backdrop"
                  className="absolute inset-0 z-20 cursor-pointer bg-black/40 backdrop-blur-[1.5px] transition-opacity duration-200"
                />
              ) : null}

              <InspectorDrawer
                node={selectedNode}
                diagnostics={selectedId ? (healthByNode[selectedId]?.diagnostics ?? []) : []}
                onClose={clearSelection}
              />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
