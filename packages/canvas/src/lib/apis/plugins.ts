import type {
  DiagnosticsUpdatedPayload,
  ExternalDiagnostic,
  LinterDetectionResult,
  PluginManifest,
} from "@routogram/types";

import { apiUrl } from "@/lib/constants";

export type PluginsResponse = {
  plugins: PluginManifest[];
  linters: LinterDetectionResult;
};

export async function fetchPlugins(): Promise<PluginsResponse> {
  const response = await fetch(apiUrl("/api/plugins"));
  if (!response.ok) throw new Error(`Plugins request failed with ${response.status}`);
  return (await response.json()) as PluginsResponse;
}

export async function installPlugin(pluginId: string): Promise<PluginManifest> {
  const response = await fetch(apiUrl("/api/plugins/install"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pluginId }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Plugin installation failed with ${response.status}`,
    );
  }
  return (payload as { plugin: PluginManifest }).plugin;
}

export async function uninstallPlugin(pluginId: string): Promise<PluginManifest> {
  const response = await fetch(apiUrl("/api/plugins/uninstall"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pluginId }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Plugin uninstall failed with ${response.status}`,
    );
  }
  return (payload as { item: PluginManifest }).item;
}

export async function triggerDiagnosticsScan(): Promise<void> {
  const response = await fetch(apiUrl("/api/plugins/scan-diagnostics"), { method: "POST" });
  if (!response.ok) {
    throw new Error(`Diagnostics scan failed with ${response.status}`);
  }
}

let latestDiagnostics: DiagnosticsUpdatedPayload["nodes"] = {};

export function cacheDiagnostics(nodes: DiagnosticsUpdatedPayload["nodes"]): void {
  latestDiagnostics = { ...latestDiagnostics, ...nodes };
}

export function getCachedDiagnostics(nodeId: string): ExternalDiagnostic[] {
  return latestDiagnostics[nodeId]?.diagnostics ?? [];
}
