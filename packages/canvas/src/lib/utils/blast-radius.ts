import type { ExternalDiagnostic, RoutogramEdge, RoutogramNode } from "@routogram/types";

import { resolveIslandVisual } from "./island-framework";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type NodeBlastRadius = {
  nodeId: string;
  upstreamIds: string[];
  downstreamIds: string[];
  affectedRoutes: string[];
  totalAffected: number;
  riskLevel: RiskLevel;
};

let blastGraphNodes: readonly RoutogramNode[] = [];
let blastGraphEdges: readonly RoutogramEdge[] = [];

export function setBlastRadiusGraph(
  nodes: readonly RoutogramNode[],
  edges: readonly RoutogramEdge[],
): void {
  blastGraphNodes = nodes;
  blastGraphEdges = edges;
}

export function getBlastRadiusGraph(): {
  nodes: readonly RoutogramNode[];
  edges: readonly RoutogramEdge[];
} {
  return { nodes: blastGraphNodes, edges: blastGraphEdges };
}

export function computeNodeBlastRadius(
  targetNodeId: string,
  nodes: readonly RoutogramNode[],
  edges: readonly RoutogramEdge[],
): NodeBlastRadius {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const reverseAdj = new Map<string, string[]>();
  const forwardAdj = new Map<string, string[]>();

  for (const edge of edges) {
    const reverse = reverseAdj.get(edge.target) ?? [];
    reverse.push(edge.source);
    reverseAdj.set(edge.target, reverse);

    const forward = forwardAdj.get(edge.source) ?? [];
    forward.push(edge.target);
    forwardAdj.set(edge.source, forward);
  }

  const upstreamSet = new Set<string>();
  const queue: string[] = [targetNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const parentId of reverseAdj.get(current) ?? []) {
      if (parentId !== targetNodeId && !upstreamSet.has(parentId)) {
        upstreamSet.add(parentId);
        queue.push(parentId);
      }
    }
  }

  const downstreamSet = new Set<string>();
  const forwardQueue: string[] = [targetNodeId];
  while (forwardQueue.length > 0) {
    const current = forwardQueue.shift();
    if (!current) continue;
    for (const childId of forwardAdj.get(current) ?? []) {
      if (childId !== targetNodeId && !downstreamSet.has(childId)) {
        downstreamSet.add(childId);
        forwardQueue.push(childId);
      }
    }
  }

  const upstreamIds = [...upstreamSet];
  const downstreamIds = [...downstreamSet];
  const affectedRoutes = upstreamIds.filter((id) => {
    const kind = nodeMap.get(id)?.kind;
    return kind === "route" || kind === "layout";
  });

  const totalAffected = upstreamIds.length;
  let riskLevel: RiskLevel = "low";
  if (totalAffected >= 10 || affectedRoutes.length >= 4) {
    riskLevel = "critical";
  } else if (totalAffected >= 5 || affectedRoutes.length >= 2) {
    riskLevel = "high";
  } else if (totalAffected >= 2) {
    riskLevel = "medium";
  }

  return {
    nodeId: targetNodeId,
    upstreamIds,
    downstreamIds,
    affectedRoutes,
    totalAffected,
    riskLevel,
  };
}

export function buildAiContextMarkdown(
  node: RoutogramNode,
  blast: NodeBlastRadius,
  nodes: readonly RoutogramNode[],
  diagnostics: readonly ExternalDiagnostic[] = [],
): string {
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  const propsList =
    node.meta?.props
      ?.map((prop) => `${prop.name}${prop.optional ? "?" : ""}: ${prop.type ?? "unknown"}`)
      .join(", ") || "none";
  const storesList = node.meta?.usedStores?.join(", ") || "none";
  const upstreamNames = blast.upstreamIds
    .slice(0, 8)
    .map((id) => nodeMap.get(id)?.name ?? id)
    .join(", ");
  const downstreamNames = blast.downstreamIds
    .slice(0, 8)
    .map((id) => nodeMap.get(id)?.name ?? id)
    .join(", ");
  const diagnosticLines =
    diagnostics.length > 0
      ? diagnostics
          .map(
            (diagnostic) =>
              `- [${diagnostic.source}:${diagnostic.severity}] ${diagnostic.ruleId}: ${diagnostic.message}`,
          )
          .join("\n")
      : "- Clean (0 issues)";

  return [
    `## Routogram Architecture Context: ${node.name}`,
    `- **File**: \`${node.file}\``,
    `- **Kind / Framework**: \`${node.kind}\` / \`${node.meta?.framework ?? node.framework ?? "ts"}\``,
    `- **Blast Radius Risk**: **${blast.riskLevel.toUpperCase()}** (${blast.totalAffected} upstream dependents, ${blast.affectedRoutes.length} routes affected)`,
    `- **Props Contract**: \`{ ${propsList} }\``,
    `- **State Stores**: \`${storesList}\``,
    `- **Upstream Callers**: ${upstreamNames || "none"}`,
    `- **Downstream Dependencies**: ${downstreamNames || "none"}`,
    "### Active Diagnostics",
    diagnosticLines,
  ].join("\n");
}

export function buildTargetedAiContextMarkdown(
  node: RoutogramNode,
  nodes: readonly RoutogramNode[],
  edges: readonly RoutogramEdge[],
): string {
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  const directInbound = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodeMap.get(edge.source)?.name ?? edge.source);
  const directOutbound = edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => nodeMap.get(edge.target)?.name ?? edge.target);
  const props =
    node.meta?.props
      ?.map((prop) => `${prop.name}${prop.optional ? "?" : ""}: ${prop.type ?? "unknown"}`)
      .join(", ") || "none";
  const stores = node.meta?.usedStores?.join(", ") || "none";
  const islandTarget = edges.find((edge) => edge.source === node.id && edge.kind === "renders");
  const islandTargetFile = islandTarget ? nodeMap.get(islandTarget.target)?.file : undefined;
  const islandVisual = resolveIslandVisual(node, islandTargetFile);
  const framework = islandVisual?.framework ?? node.meta?.framework ?? node.framework ?? "ts";

  return [
    "## Targeted Architecture Context",
    `- **Target**: ${node.name}`,
    `- **File**: \`${node.file}\``,
    `- **Kind**: ${node.kind}`,
    `- **Framework**: ${framework}`,
    `- **Props**: \`{ ${props} }\``,
    `- **Stores**: \`${stores}\``,
    `- **Direct inbound**: ${[...new Set(directInbound)].slice(0, 8).join(", ") || "none"}`,
    `- **Direct outbound**: ${[...new Set(directOutbound)].slice(0, 8).join(", ") || "none"}`,
  ].join("\n");
}
