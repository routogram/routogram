import type { RoutogramTopology } from "@routogram/types";

export type TopologyView = {
  nodes: RoutogramTopology["nodes"];
  edges: RoutogramTopology["edges"];
  rootIds: Set<string>;
  childCounts: Map<string, number>;
  expandedNodeIds: Set<string>;
};

export function getRootNodeIds(topology: RoutogramTopology): string[] {
  const macroNodes = topology.nodes.filter((node) => node.layer === "macro");
  const incomingLayoutTargets = new Set(
    topology.edges.filter((edge) => edge.kind === "routes_to").map((edge) => edge.target),
  );
  const macroRoots = macroNodes
    .filter((node) => !incomingLayoutTargets.has(node.id))
    .map((node) => node.id);

  if (macroRoots.length > 0) {
    return macroRoots;
  }

  const components = topology.nodes.filter((node) => node.kind === "component");
  const incomingRenders = new Set(
    topology.edges.filter((edge) => edge.kind === "renders").map((edge) => edge.target),
  );
  const componentRoots = components
    .filter((node) => !incomingRenders.has(node.id))
    .map((node) => node.id);
  const roots = [...macroNodes.map((node) => node.id), ...componentRoots];

  if (roots.length > 0) {
    return roots;
  }

  const fallback = topology.nodes
    .filter((node) => node.layer === "macro" || node.layer === "meso")
    .map((node) => node.id);

  return fallback.length > 0 ? fallback : topology.nodes.map((node) => node.id);
}

export function buildTopologyView(
  topology: RoutogramTopology,
  expandedRootIds: Set<string>,
  collapsedNodeIds: Set<string> = new Set(),
): TopologyView {
  const rootIds = new Set(getRootNodeIds(topology));
  const adjacency = new Map<string, string[]>();

  for (const edge of topology.edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  const childCounts = new Map<string, number>();
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const visible = new Set(rootIds);

  for (const node of topology.nodes) {
    childCounts.set(
      node.id,
      (adjacency.get(node.id) ?? []).filter((childId) => {
        const child = nodeById.get(childId);
        return node.kind === "component"
          ? child?.kind === "component"
          : child?.kind === "layout" || child?.kind === "route";
      }).length,
    );
  }

  for (const rootId of rootIds) {
    if (!expandedRootIds.has(rootId) || collapsedNodeIds.has(rootId)) {
      continue;
    }

    const queue: Array<{ nodeId: string; parentId: string }> = (adjacency.get(rootId) ?? []).map(
      (nodeId) => ({ nodeId, parentId: rootId }),
    );
    const seen = new Set<string>();

    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry || seen.has(entry.nodeId)) {
        continue;
      }
      seen.add(entry.nodeId);
      visible.add(entry.nodeId);

      if (collapsedNodeIds.has(entry.nodeId)) {
        continue;
      }

      for (const childId of adjacency.get(entry.nodeId) ?? []) {
        queue.push({ nodeId: childId, parentId: entry.nodeId });
      }
    }
  }

  if (rootIds.size === 0) {
    for (const node of topology.nodes) {
      visible.add(node.id);
    }
  }

  const visibleEdges = topology.edges.filter(
    (edge) =>
      visible.has(edge.source) && visible.has(edge.target) && !collapsedNodeIds.has(edge.source),
  );
  const expandedNodeIds = new Set(
    visibleEdges.map((edge) => edge.source).filter((source) => visible.has(source)),
  );

  return {
    nodes: topology.nodes.filter((node) => visible.has(node.id)),
    edges: visibleEdges,
    rootIds,
    childCounts,
    expandedNodeIds,
  };
}
