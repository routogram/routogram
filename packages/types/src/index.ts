// Schema contract shared by the Rust scanner, CLI daemon, and canvas client.
// Hợp đồng schema dùng chung cho bộ quét Rust, daemon CLI và canvas client.
export const ROUTOGRAM_SCHEMA_VERSION = 2 as const;
export const ROUTOGRAM_GENERATOR = "routogram" as const;
export const ROUTOGRAM_VERSION = "0.1.0";

// The four topology layers move from navigation shell to runtime boundary.
// Bốn tầng topology đi từ khung điều hướng đến ranh giới runtime.
export const ROUTOGRAM_NODE_LAYERS = ["macro", "meso", "micro", "boundary"] as const;

export type RoutogramNodeLayer = (typeof ROUTOGRAM_NODE_LAYERS)[number];

export interface RoutogramLayerMeta {
  label: string;
  description: string;
  accent: string;
}

// Layer metadata keeps every renderer aligned on naming and color.
// Metadata của tầng giúp mọi renderer thống nhất tên gọi và màu sắc.
export const ROUTOGRAM_LAYER_META: Record<RoutogramNodeLayer, RoutogramLayerMeta> = {
  macro: {
    label: "Route / Layout",
    description: "Navigation shell, route segments, and page-level layouts.",
    accent: "#f59e0b",
  },
  meso: {
    label: "Component",
    description: "Reusable UI components and composition boundaries.",
    accent: "#38bdf8",
  },
  micro: {
    label: "Style / Token",
    description: "Stylesheets, design tokens, and theme primitives.",
    accent: "#34d399",
  },
  boundary: {
    label: "Network / API",
    description: "API clients, endpoints, and server communication boundaries.",
    accent: "#fb7185",
  },
};

export const ROUTOGRAM_NODE_KINDS_BY_LAYER = {
  macro: ["route", "layout"],
  meso: ["component", "ui_component", "hook", "composable", "island"],
  micro: ["style", "token"],
  boundary: [
    "api_endpoint",
    "api_client",
    "server_action",
    "middleware",
    "backend_route",
    "controller",
  ],
} as const satisfies Record<RoutogramNodeLayer, readonly string[]>;

// Component runtime distinguishes server, client, and directive-less universal components.
// Runtime component phân biệt server, client và universal (không có directive).
export const ROUTOGRAM_RUNTIMES = ["server", "client", "universal"] as const;

export type RoutogramRuntime = (typeof ROUTOGRAM_RUNTIMES)[number];
export type RuntimeDirective = RoutogramRuntime;

export interface RoutogramRuntimeMeta {
  label: string;
  description: string;
  accent: string;
}

export const ROUTOGRAM_RUNTIME_META: Record<RoutogramRuntime, RoutogramRuntimeMeta> = {
  server: {
    label: "Server / RSC",
    description: "Runs on the server; no client bundle or browser state.",
    accent: "#34d399",
  },
  client: {
    label: "Client",
    description: "Ships to the browser and hydrates interactive UI.",
    accent: "#38bdf8",
  },
  universal: {
    label: "Universal",
    description:
      "Universal component: Executes on server or client depending on the importing context.",
    accent: "#94a3b8",
  },
};

type NodeKindsByLayer = typeof ROUTOGRAM_NODE_KINDS_BY_LAYER;

export type RoutogramNodeKind = NodeKindsByLayer[RoutogramNodeLayer][number];

// Unified, framework-agnostic aliases. Legacy kinds remain readable so
// existing snapshots and the React adapter keep rendering unchanged.
export type UiComponentNodeKind = "ui_component" | "component";
export type ComposableNodeKind = "composable" | "hook";
export type BackendRouteNodeKind = "backend_route";
export type ControllerNodeKind = "controller";

export const ROUTOGRAM_FRAMEWORK_TAGS = [
  "react",
  "vue",
  "astro",
  "svelte",
  "hono",
  "nest",
  "express",
  "vanilla",
] as const;

export type RoutogramFrameworkTag = (typeof ROUTOGRAM_FRAMEWORK_TAGS)[number] | string;

export type NodeFramework =
  | "react"
  | "next"
  | "vue"
  | "nuxt"
  | "astro"
  | "svelte"
  | "hono"
  | "nestjs"
  | "ts";

export type StoreKind = "zustand" | "pinia" | "nanostores" | "custom";

// Edges encode only the architectural relationships the scanner can prove.
// Edge chỉ mã hóa các quan hệ kiến trúc mà bộ quét chứng minh được.
export const ROUTOGRAM_EDGE_KINDS = [
  "routes_to",
  "renders",
  "dynamic_imports",
  "calls_api",
  "invokes_action",
  "styles_with",
  "cross_package",
] as const;

export type RoutogramEdgeKind = (typeof ROUTOGRAM_EDGE_KINDS)[number];

export interface RoutogramEdgeMeta {
  label: string;
  description: string;
}

export const ROUTOGRAM_EDGE_META: Record<RoutogramEdgeKind, RoutogramEdgeMeta> = {
  routes_to: {
    label: "Routes to",
    description: "A route or layout delegates navigation to another route.",
  },
  renders: {
    label: "Renders",
    description: "A macro node renders a meso or micro node in its tree.",
  },
  dynamic_imports: {
    label: "Dynamic import",
    description: "A module loads another module through a lazy import boundary.",
  },
  calls_api: {
    label: "Calls API",
    description: "A client module invokes a network or API boundary.",
  },
  invokes_action: {
    label: "Invokes action",
    description: "A client component calls a server action function.",
  },
  styles_with: {
    label: "Styles with",
    description: "A component imports a stylesheet or CSS module for its presentation.",
  },
  cross_package: {
    label: "Cross-package",
    description: "A module depends on a component or stylesheet in another workspace package.",
  },
};

export interface BlastRadiusWarning {
  selector: string;
  reason: string;
  specificityScore: number;
}

export interface StyleMetrics {
  consumedTokens: string[];
  definedClassesCount: number;
  unusedClasses: string[];
  unknownTokens?: string[];
  blastRadiusWarnings: BlastRadiusWarning[];
  stylesheets?: string[];
}

export interface RoutogramStyleToken {
  name: string;
  value: string;
  file: string;
  line: number;
  scope: "root" | "host" | "theme";
}

export interface RoutogramNetworkCall {
  endpoint: string;
  method: string;
  type: "rpc" | "fetch" | "action";
}

export interface ComponentPropMeta {
  name: string;
  type?: string;
  optional: boolean;
}

export type NodeDataFlowMeta = {
  providers: string[];
  dataRole: "fetcher" | "passive";
  fetchSignals: string[];
  reRenderSurfaceCount: number;
  sideEffects?: string[];
  stateManagement?: string[];
};

export interface RoutogramNodeMeta {
  framework?: NodeFramework;
  storeKind?: StoreKind;
  isServerComponent?: boolean;
  isDynamic?: boolean;
  isIsland?: boolean;
  hydration?: string;
  styleMetrics?: StyleMetrics;
  networkCalls?: RoutogramNetworkCall[];
  dataFlow?: NodeDataFlowMeta;
  usedStores?: string[];
  props?: ComponentPropMeta[];
}

export type WorkspaceStatus = "idle" | "scanning" | "error";

export type WorkspaceSummary = {
  id: string;
  name: string;
  projectRoot: string;
  scanPath: string;
  framework?: string;
  lastScannedAt?: string;
  nodeCount?: number;
  edgeCount?: number;
  status: WorkspaceStatus;
  errorMessage?: string;
};

export type WorkspaceRegistry = {
  version: 1;
  activeWorkspaceId: string | null;
  workspaces: Record<string, WorkspaceSummary>;
};

export type PickDirectoryResult = {
  path: string | null;
  canceled: boolean;
  supported: boolean;
};

export type DirectoryEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  hasPackageJson: boolean;
  hasSrcDir: boolean;
};

export type PathInspectionResult = {
  valid: boolean;
  exists: boolean;
  projectRoot: string;
  scanPath: string;
  hasSrcSubdir: boolean;
  detectedFramework?: string;
  suggestedName: string;
  error?: string;
};

export interface RoutogramWorkspacePackage {
  name: string;
  path: string;
  frameworks: string[];
}

export interface RoutogramWorkspace {
  tool: "pnpm" | "turbo" | "npm" | "nx" | "none" | string;
  root: string;
  packages: RoutogramWorkspacePackage[];
}

export type RoutogramEditor =
  | "vscode"
  | "cursor"
  | "vscode-insiders"
  | "zed"
  | "webstorm"
  | "intellij";

export const ROUTOGRAM_AI_PROVIDERS = ["openai", "deepseek", "anthropic", "ollama"] as const;

export type RoutogramAiProvider = (typeof ROUTOGRAM_AI_PROVIDERS)[number];

export type RoutogramAiSeverity = "critical" | "warning" | "info";

export interface RoutogramAiFinding {
  id: string;
  severity: RoutogramAiSeverity;
  category: string;
  title: string;
  description: string;
  nodeIds: string[];
  recommendation: string;
}

export interface RoutogramAiAuditResult {
  summary: string;
  score: number;
  findings: RoutogramAiFinding[];
}

export interface RoutogramAiQueryResult {
  answer: string;
  nodeIds: string[];
  confidence: number;
}

export interface RoutogramAiResponse<T> {
  result: T;
  provider: RoutogramAiProvider;
  model: string;
}

export type RoutogramMetadataValue = string | number | boolean | null;
export type RoutogramMetadata = Record<string, RoutogramMetadataValue>;

export interface RoutogramSource {
  file: string;
  line: number;
  column: number;
}

export interface RoutogramNode {
  id: string;
  layer: RoutogramNodeLayer;
  kind: RoutogramNodeKind;
  name: string;
  file: string;
  package?: string;
  route?: string;
  symbol?: string;
  framework?: string;
  runtime?: RoutogramRuntime;
  source?: RoutogramSource;
  // Legacy flat style metrics remain readable while meta is the canonical contract.
  // Style metrics phẳng cũ vẫn đọc được trong khi meta là contract chuẩn.
  styleMetrics?: StyleMetrics;
  meta?: RoutogramNodeMeta;
  metadata?: RoutogramMetadata;
}

// Prefer the nested meta contract and fall back to legacy flat metrics.
// Ưu tiên contract meta lồng nhau và fallback về metrics phẳng cũ.
export function getNodeStyleMetrics(node: RoutogramNode): StyleMetrics | undefined {
  return node.meta?.styleMetrics ?? node.styleMetrics;
}

export interface RoutogramEdge {
  id: string;
  kind: RoutogramEdgeKind;
  source: string;
  target: string;
  label?: string;
  metadata?: RoutogramMetadata;
}

export interface RoutogramStats {
  filesScanned: number;
  durationMs: number;
  warnings: string[];
}

export interface RoutogramGenerator {
  name: typeof ROUTOGRAM_GENERATOR;
  version: string;
}

export interface RoutogramTopology {
  schemaVersion: typeof ROUTOGRAM_SCHEMA_VERSION;
  generator: RoutogramGenerator;
  root: string;
  generatedAt: string;
  stats: RoutogramStats;
  nodes: RoutogramNode[];
  edges: RoutogramEdge[];
  tokens?: RoutogramStyleToken[];
  workspace?: RoutogramWorkspace;
}

export interface RoutogramTopologyPatch {
  updatedNodes: RoutogramNode[];
  removedNodeIds: string[];
  updatedEdges: RoutogramEdge[];
  removedEdgeIds: string[];
  tokens: RoutogramStyleToken[];
  generatedAt: string;
  stats: RoutogramStats;
  workspace?: RoutogramWorkspace;
}

export interface RoutogramFocusPayload {
  nodeIds: string[];
  file: string;
  line?: number;
  source: "ide" | "watcher";
}

export type RoutogramRuntimeComponentMetric = {
  key: string;
  name: string;
  file?: string;
  renderCount: number;
  rerenderCount: number;
  recentRenders: number;
  lastRenderAt: number;
};

export type RoutogramRuntimeApiCall = {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  at: number;
};

export type RoutogramRuntimeSnapshot = {
  sessionId: string;
  route: string;
  startedAt: number;
  updatedAt: number;
  components: RoutogramRuntimeComponentMetric[];
  apiCalls: RoutogramRuntimeApiCall[];
};

export type RoutogramTimelineSummary = {
  nodes: number;
  components: number;
  routes: number;
  layouts: number;
  styles: number;
  tokens: number;
  edges: number;
};

export type RoutogramTopologyDiff = {
  addedNodes: RoutogramNode[];
  removedNodes: RoutogramNode[];
  updatedNodes: RoutogramNode[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  updatedNodeIds: string[];
  addedEdges: RoutogramEdge[];
  removedEdges: RoutogramEdge[];
  updatedEdges: RoutogramEdge[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  updatedEdgeIds: string[];
  summary: RoutogramTimelineSummary;
};

export type RoutogramTimelineStep = {
  commitHash: string;
  shortHash: string;
  message: string;
  timestamp: number;
  topology: RoutogramTopology;
  diff: RoutogramTopologyDiff;
};

export type RoutogramTimeline = {
  branch: string;
  steps: RoutogramTimelineStep[];
};

export type RoutogramServerEvent = (
  | { type: "topology:snapshot"; topology: RoutogramTopology }
  | { type: "PATCH_TOPOLOGY"; payload: RoutogramTopologyPatch }
  | { type: "FOCUS_NODE"; payload: RoutogramFocusPayload }
  | { type: "RUNTIME_UPDATE"; payload: RoutogramRuntimeSnapshot }
  | { type: "CRITICAL_DRIFT_DETECTED"; payload: RoutogramDriftPayload }
  | { type: "topology:invalidate"; at: string }
  | DiagnosticsUpdatedPayload
) & { workspaceId?: string | null };

export type RoutogramDriftFinding = {
  id: string;
  kind: "circular-dependency" | "server-secret-in-client";
  severity: "critical";
  message: string;
  nodeIds: string[];
  files: string[];
  suggestedFix: string;
};

export type RoutogramDriftPayload = {
  findings: RoutogramDriftFinding[];
  at: string;
};

// Applies a Rust delta without discarding the current topology object.
// Áp dụng delta từ Rust mà không thay thế toàn bộ topology hiện tại.
export function applyTopologyPatch(
  topology: RoutogramTopology,
  patch: RoutogramTopologyPatch,
): RoutogramTopology {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));

  for (const removedId of patch.removedNodeIds) {
    nodes.delete(removedId);
  }
  for (const removedId of patch.removedEdgeIds) {
    edges.delete(removedId);
  }
  for (const node of patch.updatedNodes) {
    nodes.set(node.id, node);
  }
  for (const edge of patch.updatedEdges) {
    edges.set(edge.id, edge);
  }

  return {
    ...topology,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    tokens: patch.tokens,
    generatedAt: patch.generatedAt,
    stats: patch.stats,
    workspace: patch.workspace ?? topology.workspace,
  };
}

export function createEmptyTopology(root: string): RoutogramTopology {
  return {
    schemaVersion: ROUTOGRAM_SCHEMA_VERSION,
    generator: { name: ROUTOGRAM_GENERATOR, version: ROUTOGRAM_VERSION },
    root,
    generatedAt: new Date().toISOString(),
    stats: { filesScanned: 0, durationMs: 0, warnings: [] },
    nodes: [],
    edges: [],
    tokens: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRoutogramTopologyPatch(value: unknown): value is RoutogramTopologyPatch {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.updatedNodes) &&
    Array.isArray(value.removedNodeIds) &&
    Array.isArray(value.updatedEdges) &&
    Array.isArray(value.removedEdgeIds) &&
    Array.isArray(value.tokens) &&
    typeof value.generatedAt === "string" &&
    isRecord(value.stats)
  );
}

export function isRoutogramRuntimeSnapshot(value: unknown): value is RoutogramRuntimeSnapshot {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.route === "string" &&
    typeof value.startedAt === "number" &&
    typeof value.updatedAt === "number" &&
    Array.isArray(value.components) &&
    Array.isArray(value.apiCalls)
  );
}

export function isRoutogramTimeline(value: unknown): value is RoutogramTimeline {
  return (
    isRecord(value) &&
    typeof value.branch === "string" &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.commitHash === "string" &&
        typeof step.shortHash === "string" &&
        typeof step.message === "string" &&
        typeof step.timestamp === "number" &&
        isRecord(step.topology) &&
        isRecord(step.diff),
    )
  );
}

export function isRoutogramFocusPayload(value: unknown): value is RoutogramFocusPayload {
  return (
    isRecord(value) &&
    Array.isArray(value.nodeIds) &&
    typeof value.file === "string" &&
    (value.source === "ide" || value.source === "watcher")
  );
}

// Runtime guard protects the daemon from accepting a malformed native payload.
// Guard runtime bảo vệ daemon khỏi payload native bị sai cấu trúc.
export function isRoutogramTopology(value: unknown): value is RoutogramTopology {
  if (!isRecord(value)) {
    return false;
  }

  const generator = value.generator;
  const stats = value.stats;

  return (
    value.schemaVersion === ROUTOGRAM_SCHEMA_VERSION &&
    isRecord(generator) &&
    generator.name === ROUTOGRAM_GENERATOR &&
    typeof value.root === "string" &&
    typeof value.generatedAt === "string" &&
    isRecord(stats) &&
    typeof stats.filesScanned === "number" &&
    typeof stats.durationMs === "number" &&
    Array.isArray(stats.warnings) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    (value.tokens === undefined || Array.isArray(value.tokens))
  );
}

export type RoutogramRuleSeverity = 0 | 1 | 2;

export type RoutogramRuleSetting =
  | RoutogramRuleSeverity
  | [RoutogramRuleSeverity, Record<string, unknown>];

export interface RoutogramLintDiagnostic {
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  file?: string;
  line?: number;
}

export interface RoutogramRuleContext {
  topology: RoutogramTopology;
  options: Record<string, unknown>;
  report: (
    diagnostic: Omit<RoutogramLintDiagnostic, "ruleId" | "severity"> & {
      severity?: "error" | "warning";
    },
  ) => void;
}

export interface RoutogramRule {
  meta: {
    id: string;
    description?: string;
  };
  run: (
    context: RoutogramRuleContext,
  ) => undefined | RoutogramLintDiagnostic[] | Promise<undefined | RoutogramLintDiagnostic[]>;
}

export interface RoutogramExtractor {
  name: string;
  extract: (
    topology: RoutogramTopology,
  ) => undefined | RoutogramTopology | Promise<undefined | RoutogramTopology>;
}

export interface RoutogramPlugin {
  name: string;
  rules?: RoutogramRule[];
  extractors?: RoutogramExtractor[];
}

export interface RoutogramAiChatResult {
  answer: string;
}

export type AiProviderConfig = {
  id: string;
  name: string;
  provider: "deepseek" | "openai" | "anthropic" | "custom";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  defaultEffort?: "Low" | "Medium" | "High";
};

export type AiConfig = {
  default?: string;
  providers?: AiProviderConfig[];
};

export interface RoutogramConfig {
  $schema?: string;
  framework?: "auto" | "next" | "astro" | "vue" | "nuxt" | "sveltekit" | "tanstack" | "react";
  routerType?: "app" | "pages";
  root?: string;
  aliases?: Record<string, string>;
  tokens?: {
    prefix?: string;
  };
  maxDepth?: number;
  editor?: {
    default?: "cursor" | "vscode";
  };
  ai?: AiConfig;
  ignorePatterns?: string[];
  plugins?: RoutogramPlugin[];
  rules?: Record<string, RoutogramRuleSetting>;
}

export interface RoutogramLintSummary {
  diagnostics: RoutogramLintDiagnostic[];
  errorCount: number;
  warningCount: number;
  configPath: string | null;
  filesScanned: number;
}

export type DiagnosticSource = "core" | "security" | "biome" | "eslint" | "oxlint" | "plugin";

export type ExternalDiagnostic = {
  id: string;
  ruleId: string;
  source: DiagnosticSource;
  severity: "info" | "warning" | "error";
  message: string;
  filePath: string;
  line?: number;
  column?: number;
  suggestion?: string;
};

export type PluginKind = "linter" | "framework" | "security";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description: string;
  supportedFrameworks?: string[];
  configFiles?: string[];
  entryPoint?: string;
  installed: boolean;
  enabled: boolean;
};

export type PluginRegistryState = {
  version: 1;
  installed: Record<string, PluginManifest>;
};

export type LinterDetectionResult = {
  workspaceId: string;
  detectedLinters: Array<"biome" | "eslint" | "oxlint">;
  recommendedPlugins: string[];
};

export type DiagnosticsUpdatedPayload = {
  type: "diagnostics_updated";
  workspaceId: string;
  generatedAt: string;
  nodes: Record<
    string,
    {
      health: "safe" | "tidy" | "warning" | "danger";
      diagnostics: ExternalDiagnostic[];
    }
  >;
};
