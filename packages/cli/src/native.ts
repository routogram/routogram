import { createRequire } from "node:module";

export interface NativeScanner {
  scan: (path: string) => string;
  update: (path: string, changedFiles: string[]) => string;
}

export interface NativeCore {
  buildGraphRag: (path: string) => string;
  runMigration: (path: string, recipeId: string, apply: boolean) => string;
  scanFederation: (rootsJson: string) => string;
  simulateTopology: (path: string, topologyJson: string, operationsJson: string) => string;
  graphRagContext: (indexJson: string, nodeIdsJson: string) => string;
  queryGraphRag: (indexJson: string, aql: string, limit: number) => string;
  searchGraphRag: (indexJson: string, query: string, limit: number, filtersJson: string) => string;
  applyRefactor: (
    path: string,
    recipeId: string,
    targetNodeId: string,
    previewOnly: boolean,
  ) => string;
  checkArchRulebook: (path: string, configJson: string) => string;
  coreVersion: () => string;
  scanGitTimeline?: (path: string, limit: number) => string;
  scanWorkspace: (path: string) => string;
  scanWorkspaceWithOptions?: (path: string, optionsJson: string) => string;
  IncrementalScanner?: new () => NativeScanner;
}

export interface NativeLoadResult {
  core: NativeCore | null;
  error: string | null;
}

interface NativeModule extends Partial<Omit<NativeCore, "IncrementalScanner">> {
  IncrementalScanner?: new () => NativeScanner;
  default?: Partial<NativeCore>;
}

const require = createRequire(import.meta.url);

// Loading is lazy so the daemon still starts while the Rust addon is unbuilt.
// Việc tải được thực hiện lazy để daemon vẫn khởi động khi addon Rust chưa build.
export function loadNativeCore(): NativeLoadResult {
  try {
    const loaded = require("@routogram/core") as NativeModule;
    const candidate = loaded.default ?? loaded;

    if (
      typeof candidate.scanWorkspace !== "function" ||
      typeof candidate.applyRefactor !== "function" ||
      typeof candidate.buildGraphRag !== "function" ||
      typeof candidate.simulateTopology !== "function" ||
      typeof candidate.runMigration !== "function" ||
      typeof candidate.scanFederation !== "function" ||
      typeof candidate.checkArchRulebook !== "function" ||
      typeof candidate.coreVersion !== "function"
    ) {
      return {
        core: null,
        error: "The @routogram/core package does not expose the expected NAPI bindings.",
      };
    }

    return { core: candidate as NativeCore, error: null };
  } catch (error) {
    return {
      core: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
