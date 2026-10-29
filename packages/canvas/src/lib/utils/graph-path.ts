type PathEdge = {
  id: string;
  source: string;
  target: string;
};

export type AncestorPath = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
};

/**
 * Walk incoming edges from a node back to every reachable ancestor/root.
 * The traversal is cycle-safe, so malformed graphs cannot hang the hover path.
 */
export function getAncestorPath(
  targetNodeId: string,
  edges: ReadonlyArray<PathEdge>,
): AncestorPath {
  const nodeIds = new Set<string>([targetNodeId]);
  const edgeIds = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentId) {
        continue;
      }

      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source)) {
        nodeIds.add(edge.source);
        queue.push(edge.source);
      }
    }
  }

  return { nodeIds, edgeIds };
}
