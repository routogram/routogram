import type { RoutogramTopology } from "@routogram/types";

import { API, apiUrl } from "@/lib/constants";

export type SimulationOperation =
  | { type: "delete-node"; nodeIds: string[] }
  | { type: "flip-boundary"; nodeIds: string[]; target: "client" | "server" }
  | { type: "migrate-router"; from: string; to: string }
  | { type: "prune-orphans" };

export type SimulationStats = {
  nodes: number;
  edges: number;
  clientComponents: number;
  routeCount: number;
  orphanComponents: number;
  bundleBytes: number;
  tokenCount: number;
};

export type SimulationBreakpoint = {
  kind: string;
  severity: string;
  message: string;
  nodeId?: string;
  file?: string;
};

export type ProjectedTopology = RoutogramTopology;

export type SimulationResult = {
  baseline: SimulationStats;
  projected: SimulationStats;
  operations: SimulationOperation[];
  affectedNodeIds: string[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
  orphanNodeIds: string[];
  brokenEdgeIds: string[];
  lostTokens: string[];
  bundleDeltaBytes: number;
  breakpoints: SimulationBreakpoint[];
  projectedTopology: ProjectedTopology;
};

export type MigrationFile = {
  path: string;
  isNew: boolean;
  isDeleted: boolean;
  diff: string;
  before: string;
  after: string;
};

export type MigrationResult = {
  recipeId: string;
  summary: string;
  files: MigrationFile[];
  applied: boolean;
  changed: boolean;
  bytesSaved: number;
  projectedTopology: ProjectedTopology;
};

export async function forkSimulation(
  operations: SimulationOperation[] = [],
): Promise<SimulationResult> {
  return request<SimulationResult>(API.simulationFork, { operations });
}

export async function mutateSimulation(
  operations: SimulationOperation[],
): Promise<SimulationResult> {
  return request<SimulationResult>(API.simulationMutate, { operations });
}

export async function resetSimulation(): Promise<SimulationResult> {
  return request<SimulationResult>(API.simulationReset, {});
}

export async function scanMigration(recipeId: string): Promise<MigrationResult> {
  return request<MigrationResult>(API.migrationScan, { recipeId });
}

async function request<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Simulation request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}
