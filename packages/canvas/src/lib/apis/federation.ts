import type { RoutogramTopology } from "@routogram/types";

import { apiUrl } from "@/lib/constants";

export type FederatedApp = {
  id: string;
  name: string;
  root: string;
  nodeCount: number;
  routeCount: number;
};

export type FederationConflict = {
  kind: string;
  severity: string;
  message: string;
  apps: string[];
};

export type FederatedTopology = {
  topology: RoutogramTopology;
  apps: FederatedApp[];
  remotes: Array<{ appId: string; name: string; url: string; configFile: string }>;
  sharedDependencies: Array<{
    name: string;
    versions: Array<{ appId: string; version: string }>;
    conflict: boolean;
  }>;
  conflicts: FederationConflict[];
};

export async function fetchFederation(): Promise<FederatedTopology | null> {
  try {
    const response = await fetch(apiUrl("/api/federation"));
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
    return isFederation(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isFederation(value: unknown): value is FederatedTopology {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as FederatedTopology).apps) &&
    typeof (value as FederatedTopology).topology === "object"
  );
}
