import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import type { PathInspectionResult, WorkspaceRegistry, WorkspaceSummary } from "@routogram/types";

import { readJsonFile, type UserDirectory, writeJsonAtomic } from "./user-directory.js";

const MAX_WALK_UP = 4;
const PROJECT_MARKERS = ["package.json", "tsconfig.json", ".git"];

export function workspaceId(scanPath: string): string {
  const hash = createHash("sha256").update(scanPath).digest("hex").slice(0, 12);
  return `ws_${hash}`;
}

export function loadWorkspaceRegistry(user: UserDirectory): WorkspaceRegistry {
  const path = resolve(user.root, "workspaces.json");
  const parsed = readJsonFile<unknown>(path, null);
  if (!isRegistry(parsed)) {
    const empty: WorkspaceRegistry = {
      version: 1,
      activeWorkspaceId: null,
      workspaces: {},
    };
    saveWorkspaceRegistry(user, empty);
    return empty;
  }
  return parsed;
}

export function saveWorkspaceRegistry(user: UserDirectory, registry: WorkspaceRegistry): void {
  writeJsonAtomic(resolve(user.root, "workspaces.json"), registry);
}

export function resolveProjectAndScanRoot(inputPath: string): {
  projectRoot: string;
  scanPath: string;
  suggestedName: string;
  framework?: string;
} {
  const requested = resolve(inputPath);
  const stats = statSync(requested, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    throw new Error(`Path is not a readable directory: ${requested}`);
  }

  const projectRoot = findProjectRoot(requested);
  const packageJson = readPackageJson(projectRoot);
  const suggestedName =
    (typeof packageJson?.name === "string" && packageJson.name.trim()) ||
    basename(projectRoot) ||
    "workspace";

  return {
    projectRoot,
    scanPath: requested,
    suggestedName,
    framework: detectFramework(packageJson),
  };
}

export function inspectPath(inputPath: string): PathInspectionResult {
  const requested = resolve(inputPath);
  try {
    const stats = statSync(requested, { throwIfNoEntry: false });
    if (!stats) {
      return invalid(inputPath, "Path does not exist.");
    }
    if (!stats.isDirectory()) {
      return invalid(inputPath, "Path is not a directory.");
    }

    const projectRoot = findProjectRoot(requested);
    const packageJson = readPackageJson(projectRoot);
    const srcPath = resolve(projectRoot, "src");
    return {
      valid: true,
      exists: true,
      projectRoot,
      scanPath: requested,
      hasSrcSubdir: existsSync(srcPath) && statSync(srcPath).isDirectory(),
      detectedFramework: detectFramework(packageJson),
      suggestedName:
        (typeof packageJson?.name === "string" && packageJson.name.trim()) ||
        basename(projectRoot) ||
        "workspace",
    };
  } catch (error) {
    return invalid(inputPath, error instanceof Error ? error.message : String(error));
  }
}

export function createSummary(input: {
  scanPath: string;
  projectRoot: string;
  name: string;
  framework?: string;
}): WorkspaceSummary {
  return {
    id: workspaceId(input.scanPath),
    name: input.name,
    projectRoot: input.projectRoot,
    scanPath: input.scanPath,
    ...(input.framework ? { framework: input.framework } : {}),
    status: "idle",
  };
}

export function findWorkspaceByPath(
  registry: WorkspaceRegistry,
  path: string,
): WorkspaceSummary | null {
  const target = resolve(path);
  return (
    Object.values(registry.workspaces).find(
      (workspace) => resolve(workspace.scanPath) === target,
    ) ?? null
  );
}

function findProjectRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth <= MAX_WALK_UP; depth += 1) {
    if (PROJECT_MARKERS.some((marker) => existsSync(resolve(current, marker)))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return start;
}

function readPackageJson(root: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function detectFramework(packageJson: Record<string, unknown> | null): string | undefined {
  const dependencies = {
    ...(typeof packageJson?.dependencies === "object" && packageJson.dependencies !== null
      ? (packageJson.dependencies as Record<string, unknown>)
      : {}),
    ...(typeof packageJson?.devDependencies === "object" && packageJson.devDependencies !== null
      ? (packageJson.devDependencies as Record<string, unknown>)
      : {}),
  };
  if ("next" in dependencies) return "Next.js";
  if ("nuxt" in dependencies) return "Nuxt";
  if ("@sveltejs/kit" in dependencies) return "SvelteKit";
  if ("astro" in dependencies) return "Astro";
  if ("vue" in dependencies) return "Vue";
  if ("@tanstack/react-router" in dependencies) return "TanStack Router";
  if ("react" in dependencies) return "React";
  return undefined;
}

function invalid(path: string, error: string): PathInspectionResult {
  return {
    valid: false,
    exists: false,
    projectRoot: resolve(path),
    scanPath: resolve(path),
    hasSrcSubdir: false,
    suggestedName: basename(path),
    error,
  };
}

function isRegistry(value: unknown): value is WorkspaceRegistry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WorkspaceRegistry>;
  return (
    candidate.version === 1 &&
    (candidate.activeWorkspaceId === null || typeof candidate.activeWorkspaceId === "string") &&
    typeof candidate.workspaces === "object" &&
    candidate.workspaces !== null
  );
}
