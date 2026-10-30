import type {
  DirectoryEntry,
  PathInspectionResult,
  PickDirectoryResult,
  WorkspaceRegistry,
  WorkspaceSummary,
} from "@routogram/types";

import { apiUrl } from "@/lib/constants";
import { invokeDesktopPickDirectory, isDesktopEnvironment } from "@/lib/desktop/desktop-bridge";

const BASE = "/api/workspaces";
const FS_LIST = "/api/fs/list";
const DAEMON_PORTS = Array.from({ length: 11 }, (_, index) => 4040 + index);

let fallbackDaemonBase: string | null = null;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), init);
  if (response.status !== 502 && response.status !== 503) return response;

  const base = fallbackDaemonBase ?? (await findDaemonBase());
  if (!base) return response;

  try {
    const direct = await fetch(`${base}${path}`, init);
    if (direct.ok || direct.status < 500) {
      fallbackDaemonBase = base;
    }
    return direct;
  } catch {
    return response;
  }
}

async function findDaemonBase(): Promise<string | null> {
  for (const port of DAEMON_PORTS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(350),
      });
      if (response.ok) {
        fallbackDaemonBase = `http://127.0.0.1:${port}`;
        window.__ROUTOGRAM_DAEMON_URL__ = fallbackDaemonBase;
        return fallbackDaemonBase;
      }
    } catch {
      // Try the next daemon port.
    }
  }
  return null;
}

function daemonOfflineMessage(): string {
  return "Cannot reach the Routogram daemon. Start it with pnpm dev, then retry.";
}

export async function fetchWorkspaceRegistry(): Promise<WorkspaceRegistry> {
  const response = await request(BASE);
  const payload = await readJson(response);
  if (!response.ok || payload === null) {
    throw new Error(errorMessage(payload, `Workspace registry failed with ${response.status}`));
  }
  return payload as WorkspaceRegistry;
}

export async function pickWorkspaceDirectory(): Promise<PickDirectoryResult> {
  if (isDesktopEnvironment()) {
    const path = await invokeDesktopPickDirectory();
    if (path) {
      return { path, canceled: false, supported: true };
    }
  }

  const response = await request(`${BASE}/pick-directory`, { method: "POST" });
  const payload = await readJson(response);
  if (response.status === 502 || response.status === 503) throw new Error(daemonOfflineMessage());
  if (!response.ok) {
    throw new Error(errorMessage(payload, `Folder picker failed with ${response.status}`));
  }
  if (payload === null) {
    throw new Error("Folder picker returned an empty response. Enter a path manually.");
  }
  return payload as PickDirectoryResult;
}

export async function listServerDirectories(
  path?: string,
): Promise<{ path: string; entries: DirectoryEntry[] }> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await request(`${FS_LIST}${query}`);
  if (response.status === 502 || response.status === 503) throw new Error(daemonOfflineMessage());
  const payload = await readJson(response);
  if (!response.ok || payload === null) {
    throw new Error(errorMessage(payload, `Directory listing failed with ${response.status}`));
  }
  return payload as { path: string; entries: DirectoryEntry[] };
}

export async function inspectWorkspacePath(path: string): Promise<PathInspectionResult> {
  const response = await request(`${BASE}/inspect-path`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const payload = await readJson(response);
  if (!response.ok || payload === null) {
    throw new Error(errorMessage(payload, `Path inspection failed with ${response.status}`));
  }
  return payload as PathInspectionResult;
}

export async function addWorkspace(path: string, scanPath?: string): Promise<WorkspaceSummary> {
  const response = await request(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, ...(scanPath ? { scanPath } : {}) }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, "Could not add workspace"));
  const workspace = workspaceFromPayload(payload);
  if (!workspace) {
    throw new Error(
      payload === null
        ? `Server returned an empty workspace response (${response.status})`
        : "Server returned an invalid workspace response.",
    );
  }
  return workspace;
}

export async function activateWorkspace(id: string): Promise<WorkspaceSummary> {
  const response = await request(`${BASE}/${id}/activate`, { method: "POST" });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, "Could not activate workspace"));
  const workspace = workspaceFromPayload(payload);
  if (!workspace) throw new Error("Server returned an invalid workspace response.");
  return workspace;
}

export async function rescanWorkspace(id: string): Promise<WorkspaceSummary> {
  const response = await request(`${BASE}/${id}/rescan`, { method: "POST" });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, "Could not rescan workspace"));
  const workspace = workspaceFromPayload(payload);
  if (!workspace) throw new Error("Server returned an invalid workspace response.");
  return workspace;
}

export async function removeWorkspace(id: string): Promise<void> {
  const response = await request(`${BASE}/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not remove workspace (${response.status})`);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function workspaceFromPayload(value: unknown): WorkspaceSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const workspace = (value as { workspace?: unknown }).workspace;
  return typeof workspace === "object" && workspace !== null
    ? (workspace as WorkspaceSummary)
    : null;
}

function errorMessage(value: unknown, fallback: string): string {
  return typeof value === "object" && value !== null && "error" in value
    ? String((value as { error: unknown }).error)
    : fallback;
}
