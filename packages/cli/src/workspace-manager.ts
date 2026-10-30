import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  isRoutogramTopology,
  type PathInspectionResult,
  type RoutogramConfig,
  type RoutogramTopology,
  type WorkspaceRegistry,
  type WorkspaceSummary,
} from "@routogram/types";
import { loadRoutogramConfig } from "./config.js";
import { analyzeCodeHealth, type CodeHealthReport } from "./health.js";
import type { NativeCore } from "./native.js";
import {
  ensureUserDirectory,
  readJsonFile,
  type UserDirectory,
  workspaceDirectory,
  writeJsonAtomic,
} from "./storage/user-directory.js";
import {
  createSummary,
  findWorkspaceByPath,
  inspectPath,
  loadWorkspaceRegistry,
  resolveProjectAndScanRoot,
  saveWorkspaceRegistry,
} from "./storage/workspace-registry.js";

export type WorkspaceScanResult = {
  summary: WorkspaceSummary;
  topology: RoutogramTopology;
  health: CodeHealthReport;
  config: RoutogramConfig;
  raw: Record<string, unknown>;
  configPath: string | null;
  cached: boolean;
};

export type WorkspaceSnapshot = {
  version: 1;
  savedAt: string;
  summary: WorkspaceSummary;
  topology: RoutogramTopology;
};

export type WorkspaceManagerOptions = {
  native: NativeCore | null;
  userFolder?: string;
};

type ScanOptions = {
  scanPath?: string;
};

export class WorkspaceManager {
  readonly user: UserDirectory;
  private readonly native: NativeCore | null;
  private registry: WorkspaceRegistry;
  private readonly scanning = new Set<string>();
  private onUpdated: ((result: WorkspaceScanResult) => void) | null = null;

  constructor(options: WorkspaceManagerOptions) {
    this.user = ensureUserDirectory();
    this.native = options.native;
    this.registry = loadWorkspaceRegistry(this.user);
  }

  setOnUpdated(listener: (result: WorkspaceScanResult) => void): void {
    this.onUpdated = listener;
  }

  getRegistry(): WorkspaceRegistry {
    return structuredClone(this.registry);
  }

  getActiveId(): string | null {
    return this.registry.activeWorkspaceId;
  }

  getActiveSummary(): WorkspaceSummary | null {
    const id = this.registry.activeWorkspaceId;
    return id ? (this.registry.workspaces[id] ?? null) : null;
  }

  inspect(path: string): PathInspectionResult {
    return inspectPath(path);
  }

  async initialize(initialPath?: string): Promise<WorkspaceScanResult | null> {
    if (initialPath) {
      return this.add(initialPath);
    }

    const activeId = this.registry.activeWorkspaceId;
    if (!activeId || !this.registry.workspaces[activeId]) {
      return null;
    }

    return this.activate(activeId, { background: false });
  }

  async add(path: string, options: ScanOptions = {}): Promise<WorkspaceScanResult> {
    const inspection = this.inspect(path);
    if (!inspection.valid) {
      throw new Error(inspection.error ?? "Invalid workspace path.");
    }

    const resolved = resolveProjectAndScanRoot(path);
    const scanPath = resolve(options.scanPath ?? path);
    if (!statSync(scanPath, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Scan path is not a directory: ${scanPath}`);
    }

    const existing = findWorkspaceByPath(this.registry, scanPath);
    if (existing) {
      return this.activate(existing.id, { background: false });
    }

    const summary = createSummary({
      scanPath,
      projectRoot: resolved.projectRoot,
      name: inspection.suggestedName,
      framework: inspection.detectedFramework,
    });
    workspaceDirectory(this.user, summary.id);
    this.registry.workspaces[summary.id] = summary;
    this.registry.activeWorkspaceId = summary.id;
    saveWorkspaceRegistry(this.user, this.registry);

    return this.scan(summary);
  }

  async activate(id: string, options: { background?: boolean } = {}): Promise<WorkspaceScanResult> {
    const summary = this.registry.workspaces[id];
    if (!summary) {
      throw new Error(`Workspace not found: ${id}`);
    }

    this.registry.activeWorkspaceId = id;
    saveWorkspaceRegistry(this.user, this.registry);

    const snapshot = this.readSnapshot(id);
    if (snapshot) {
      const projectConfig = await loadRoutogramConfig(snapshot.summary.projectRoot).catch(() => ({
        config: {} as RoutogramConfig,
        raw: {} as Record<string, unknown>,
        path: null,
      }));
      const merged = this.mergeConfig(projectConfig);
      const result = this.resultFromSnapshot(snapshot, merged);
      if (options.background !== false) {
        void this.refreshInBackground(id);
      }
      return result;
    }

    return this.scan(summary);
  }

  async rescan(id?: string): Promise<WorkspaceScanResult> {
    const targetId = id ?? this.registry.activeWorkspaceId;
    const summary = targetId ? this.registry.workspaces[targetId] : null;
    if (!summary) {
      throw new Error("No active workspace to rescan.");
    }
    return this.scan(summary);
  }

  remove(id: string): void {
    if (!this.registry.workspaces[id]) {
      return;
    }

    delete this.registry.workspaces[id];
    if (this.registry.activeWorkspaceId === id) {
      this.registry.activeWorkspaceId = null;
    }
    saveWorkspaceRegistry(this.user, this.registry);
    rmSync(workspaceDirectory(this.user, id), { recursive: true, force: true });
  }

  async refreshInBackground(id: string): Promise<void> {
    const summary = this.registry.workspaces[id];
    if (!summary) return;
    try {
      const result = await this.scan(summary);
      this.onUpdated?.(result);
    } catch {
      // The persisted error state is exposed through the registry.
    }
  }

  private async scan(summary: WorkspaceSummary): Promise<WorkspaceScanResult> {
    if (!this.native) {
      throw new Error("The native scanner is unavailable.");
    }
    if (this.scanning.has(summary.id)) {
      throw new Error("This workspace is already being scanned.");
    }

    this.scanning.add(summary.id);
    const directory = workspaceDirectory(this.user, summary.id);
    this.updateSummary(summary.id, { status: "scanning", errorMessage: undefined });

    try {
      const options = JSON.stringify({
        projectRoot: summary.projectRoot,
        scanRoot: summary.scanPath,
        cacheDir: resolve(directory, "cache"),
      });
      const raw = this.native.scanWorkspaceWithOptions
        ? this.native.scanWorkspaceWithOptions(summary.scanPath, options)
        : this.native.scanWorkspace(summary.projectRoot);
      const topology: unknown = JSON.parse(raw);
      if (!isRoutogramTopology(topology)) {
        throw new Error("The native scanner returned an invalid topology payload.");
      }

      const health = analyzeCodeHealth(summary.projectRoot, topology);
      const projectConfig = await loadRoutogramConfig(summary.projectRoot).catch(() => ({
        config: {} as RoutogramConfig,
        raw: {} as Record<string, unknown>,
        path: null,
      }));
      const merged = this.mergeConfig(projectConfig);
      const scannedAt = new Date().toISOString();
      const nextSummary: WorkspaceSummary = {
        ...summary,
        status: "idle",
        lastScannedAt: scannedAt,
        nodeCount: topology.nodes.length,
        edgeCount: topology.edges.length,
        ...(summary.framework || merged.framework
          ? {
              framework:
                normalizeFramework(summary.framework) ??
                normalizeFramework(merged.framework) ??
                summary.framework ??
                merged.framework,
            }
          : {}),
      };

      writeJsonAtomic(resolve(directory, "snapshot.json"), {
        version: 1,
        savedAt: scannedAt,
        summary: nextSummary,
        topology,
      } satisfies WorkspaceSnapshot);
      writeJsonAtomic(resolve(directory, "health.json"), health);
      this.updateSummary(summary.id, nextSummary);
      this.registry.workspaces[summary.id] = nextSummary;
      saveWorkspaceRegistry(this.user, this.registry);

      return {
        summary: nextSummary,
        topology,
        health,
        config: merged.config,
        raw: merged.raw,
        configPath: merged.configPath,
        cached: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateSummary(summary.id, { status: "error", errorMessage: message });
      throw error;
    } finally {
      this.scanning.delete(summary.id);
    }
  }

  private readSnapshot(id: string): WorkspaceSnapshot | null {
    try {
      const path = resolve(workspaceDirectory(this.user, id), "snapshot.json");
      if (!existsSync(path)) return null;
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("topology" in parsed) ||
        !isRoutogramTopology((parsed as { topology?: unknown }).topology)
      ) {
        return null;
      }
      return parsed as WorkspaceSnapshot;
    } catch {
      return null;
    }
  }

  private resultFromSnapshot(
    snapshot: WorkspaceSnapshot,
    merged: { config: RoutogramConfig; raw: Record<string, unknown>; configPath: string | null },
  ): WorkspaceScanResult {
    const health = readJsonFile<CodeHealthReport>(
      resolve(workspaceDirectory(this.user, snapshot.summary.id), "health.json"),
      { generatedAt: new Date(0).toISOString(), nodes: {} },
    );
    return {
      summary: snapshot.summary,
      topology: snapshot.topology,
      health,
      config: merged.config,
      raw: merged.raw,
      configPath: merged.configPath,
      cached: true,
    };
  }

  private updateSummary(id: string, patch: Partial<WorkspaceSummary>): void {
    const current = this.registry.workspaces[id];
    if (!current) return;
    this.registry.workspaces[id] = { ...current, ...patch };
    saveWorkspaceRegistry(this.user, this.registry);
  }

  private mergeConfig(project: {
    config: RoutogramConfig;
    raw: Record<string, unknown>;
    path: string | null;
  }): {
    config: RoutogramConfig;
    raw: Record<string, unknown>;
    configPath: string | null;
    framework?: string;
  } {
    const globalRaw = readJsonFile<Record<string, unknown>>(
      resolve(this.user.root, "config.json"),
      {},
    );
    const globalConfig = globalRaw as Partial<RoutogramConfig>;
    const config: RoutogramConfig = {
      ...globalConfig,
      ...project.config,
      aliases: { ...(globalConfig.aliases ?? {}), ...(project.config.aliases ?? {}) },
      tokens: { ...(globalConfig.tokens ?? {}), ...(project.config.tokens ?? {}) },
      ignorePatterns: [
        ...(globalConfig.ignorePatterns ?? []),
        ...(project.config.ignorePatterns ?? []),
      ],
      ai: {
        ...(globalConfig.ai ?? {}),
        ...(project.config.ai ?? {}),
        providers: project.config.ai?.providers ?? globalConfig.ai?.providers ?? [],
      },
    };
    return {
      config,
      raw: { ...globalRaw, ...project.raw },
      configPath: project.path,
      framework: typeof config.framework === "string" ? config.framework : undefined,
    };
  }
}

export function normalizeFramework(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "next" || normalized === "next.js") return "Next.js";
  if (normalized === "nuxt") return "Nuxt";
  if (normalized === "sveltekit") return "SvelteKit";
  if (normalized === "astro") return "Astro";
  if (normalized === "vue") return "Vue";
  if (normalized === "tanstack") return "TanStack Router";
  if (normalized === "react") return "React";
  return value;
}
