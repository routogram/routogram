#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { Server as HttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { publishSnapshot } from "@routogram/cloud-sync";
import {
  applyTopologyPatch,
  isRoutogramRuntimeSnapshot,
  isRoutogramTimeline,
  isRoutogramTopology,
  isRoutogramTopologyPatch,
  ROUTOGRAM_VERSION,
  type RoutogramConfig,
  type RoutogramRuntimeSnapshot,
  type RoutogramServerEvent,
} from "@routogram/types";
import { config as loadEnv } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocket, WebSocketServer } from "ws";
import { AgentMissionManager } from "./agent/mod.js";
import { loadAnnotations } from "./annotations.js";
import { generateArchitectureMarkdown } from "./architecture-doc.js";
import { loadRoutogramConfig } from "./config.js";
import { formatDiffJson, formatDiffMarkdown, runArchitectureDiff } from "./diff.js";
import { buildEditorUrl, detectEditor, normalizeEditor } from "./editors.js";
import { analyzeCodeHealth } from "./health.js";
import { formatLintSummary, runLint } from "./lint.js";
import { loadNativeCore } from "./native.js";
import { createAgentRoutes } from "./routes/agent.js";
import { createAiRoutes } from "./routes/ai.js";
import { createAnnotationRoutes } from "./routes/annotations.js";
import { createCollabServer } from "./routes/collab.js";
import { createConfigRoutes } from "./routes/config.js";
import { createDriftRoutes } from "./routes/drift.js";
import { createFederationRoutes } from "./routes/federation.js";
import { createGraphRoutes } from "./routes/graph.js";
import { createMigrationRoutes } from "./routes/migration.js";
import { createRefactorRoutes } from "./routes/refactor.js";
import { createSimulationRoutes } from "./routes/simulation.js";
import { formatRulebookMarkdown, formatRulebookSarif, runRulebook } from "./rulebook.js";
import { createSampleTopology } from "./sample.js";
import { runStaticExport } from "./static-export.js";
import { detectDrift, notifyDrift } from "./watcher/drift.js";

loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const DEFAULT_PORT = 4040;
const DEFAULT_CANVAS_PORT = 6060;
const DEFAULT_STATIC_OUT_DIR = "routogram-report";
const HOST = process.env.ROUTOGRAM_HOST ?? "127.0.0.1";
const IGNORED_SEGMENTS = new Set([".git", ".turbo", ".vite", "dist", "node_modules", "target"]);

const rawArgs = process.argv.slice(2);
const subcommand:
  | "serve"
  | "diff"
  | "lint"
  | "test-arch"
  | "graph"
  | "publish"
  | "snapshot"
  | "report"
  | "lsp" =
  rawArgs[0] === "diff" ||
  rawArgs[0] === "lint" ||
  rawArgs[0] === "test-arch" ||
  rawArgs[0] === "graph" ||
  rawArgs[0] === "publish" ||
  rawArgs[0] === "snapshot" ||
  rawArgs[0] === "report" ||
  rawArgs[0] === "lsp"
    ? rawArgs[0]
    : "serve";
const parseInput = subcommand === "serve" ? rawArgs : rawArgs.slice(1);
const normalizedInput =
  subcommand === "publish" || subcommand === "snapshot"
    ? parseInput.map((argument) => (argument === "--version" ? "--release" : argument))
    : parseInput;
const { values, positionals } = parseArgs({
  args: normalizedInput,
  allowPositionals: true,
  options: {
    port: { type: "string", short: "p" },
    root: { type: "string", short: "r" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    "no-watch": { type: "boolean" },
    "no-open": { type: "boolean" },
    "no-canvas": { type: "boolean" },
    open: { type: "boolean" },
    report: { type: "boolean" },
    "canvas-port": { type: "string" },
    static: { type: "boolean" },
    out: { type: "string", short: "o" },
    base: { type: "string" },
    head: { type: "string" },
    format: { type: "string" },
    "fail-on-dead-css": { type: "boolean" },
    "max-blast-radius": { type: "string" },
    config: { type: "string" },
    json: { type: "boolean" },
    aql: { type: "boolean" },
    roots: { type: "string" },
    limit: { type: "string" },
    release: { type: "string" },
    project: { type: "string" },
    hub: { type: "string" },
    token: { type: "string" },
    "upload-url": { type: "string" },
    "public-url": { type: "string" },
    stdio: { type: "boolean" },
  },
});

if (values.help) {
  printHelp();
  process.exit(0);
}

if (values.version) {
  console.log(`routogram ${ROUTOGRAM_VERSION}`);
  process.exit(0);
}

if (subcommand === "diff") {
  const threshold = Number(values["max-blast-radius"] ?? 3);

  if (!Number.isInteger(threshold) || threshold < 0) {
    console.error("[diff] --max-blast-radius must be a non-negative integer.");
    process.exit(1);
  }

  try {
    const report = runArchitectureDiff({
      cwd: process.cwd(),
      base: values.base ?? "origin/main",
      head: values.head ?? "HEAD",
      failOnDeadCss: Boolean(values["fail-on-dead-css"]),
      maxBlastRadius: threshold,
    });
    const output = values.format === "json" ? formatDiffJson(report) : formatDiffMarkdown(report);

    console.log(output);
    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    console.error(`[diff] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (subcommand === "lsp") {
  const lspRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const binary = findLspBinary();

  if (!binary) {
    console.error(
      "[lsp] routogram-lsp binary not found. Run `pnpm build:lsp` or set ROUTOGRAM_LSP_BIN.",
    );
    process.exit(1);
  }

  const child = spawn(binary, ["--root", lspRoot], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (error) => {
    console.error(`[lsp] ${error.message}`);
    process.exit(1);
  });
} else if (subcommand === "report") {
  const reportRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const native = loadNativeCore();

  if (!native.core) {
    console.error(`[report] ${native.error ?? "Native scanner unavailable."}`);
    process.exit(1);
  }

  try {
    const topology: unknown = JSON.parse(native.core.scanWorkspace(reportRoot));
    const markdown = generateArchitectureMarkdown(
      topology as Parameters<typeof generateArchitectureMarkdown>[0],
      { project: values.project ?? basename(reportRoot) },
    );
    if (values.format === "json") {
      console.log(JSON.stringify({ markdown }, null, 2));
      process.exit(0);
    }
    const output = resolve(reportRoot, values.out ?? "ARCHITECTURE.md");
    writeFileSync(output, `${markdown}\n`);
    console.log(`[report] wrote ${output}`);
    process.exit(0);
  } catch (error) {
    console.error(`[report] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (subcommand === "publish" || subcommand === "snapshot") {
  const publishRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const native = loadNativeCore();

  if (!native.core) {
    console.error(`[publish] ${native.error ?? "The native scanner is unavailable."}`);
    process.exit(1);
  }

  try {
    const topology: unknown = JSON.parse(native.core.scanWorkspace(publishRoot));
    const annotations = loadAnnotations(publishRoot).annotations;
    const result = await publishSnapshot({
      root: publishRoot,
      project: values.project ?? basename(publishRoot),
      version: values.release ?? process.env.ROUTOGRAM_RELEASE ?? "dev",
      topology: topology as Parameters<typeof publishSnapshot>[0]["topology"],
      annotations,
      hubUrl: values.hub,
      token: values.token,
      uploadUrl: values["upload-url"],
      publicUrl: values["public-url"],
      localDir: values.out,
    });

    console.log(
      values.json
        ? JSON.stringify(result, null, 2)
        : `Published ${result.project}@${result.version} (${result.bytes} bytes)\n${result.url}`,
    );
    process.exit(0);
  } catch (error) {
    console.error(`[publish] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (subcommand === "graph") {
  const graphRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const native = loadNativeCore();

  if (!native.core) {
    console.error(`[graph] ${native.error ?? "The native graph engine is unavailable."}`);
    process.exit(1);
  }

  try {
    const action = positionals[0] ?? "index";
    const indexJson = native.core.buildGraphRag(graphRoot);

    if (action === "index") {
      const output = resolve(graphRoot, values.out ?? ".routogram/graph-rag.json");
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(JSON.parse(indexJson), null, 2)}\n`);
      const stats = (JSON.parse(indexJson) as { stats?: unknown }).stats;
      console.log(JSON.stringify({ output, stats }, null, 2));
      process.exit(0);
    }

    if (action === "search") {
      const queryText = positionals.slice(1).join(" ").trim();
      if (!queryText) {
        console.error("[graph] Usage: routogram graph search <query> [--aql]");
        process.exit(1);
      }
      const limit = Number(values.limit ?? 12);
      const response = JSON.parse(
        values.aql
          ? native.core.queryGraphRag(indexJson, queryText, limit)
          : native.core.searchGraphRag(indexJson, queryText, limit, "{}"),
      ) as { results?: Array<{ title?: string; kind?: string; text?: string; score?: number }> };
      if (values.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        for (const result of response.results ?? []) {
          const score = typeof result.score === "number" ? result.score.toFixed(3) : "—";
          console.log(`[${score}] ${result.title ?? "Untitled"} (${result.kind ?? "document"})`);
          if (result.text) {
            console.log(`  ${result.text.slice(0, 180)}`);
          }
        }
      }
      process.exit(0);
    }

    if (action === "context") {
      const nodeIds = positionals.slice(1);
      if (nodeIds.length === 0) {
        console.error("[graph] Usage: routogram graph context <nodeId...>");
        process.exit(1);
      }
      const context = native.core.graphRagContext(indexJson, JSON.stringify(nodeIds));
      console.log(values.json ? context : (JSON.parse(context) as { text: string }).text);
      process.exit(0);
    }

    console.error(`[graph] Unknown action: ${action}`);
    process.exit(1);
  } catch (error) {
    console.error(`[graph] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (subcommand === "test-arch") {
  const rulebookRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );

  try {
    const { report, configPath } = await runRulebook({
      root: rulebookRoot,
      configPath: values.config ?? process.env.ROUTOGRAM_RULEBOOK,
    });
    const format = values.format === "sarif" ? "sarif" : "markdown";
    const output =
      format === "sarif" ? formatRulebookSarif(report) : formatRulebookMarkdown(report, configPath);

    console.log(output);
    process.exit(report.errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error(`[test-arch] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (subcommand === "lint") {
  const lintRoot = resolve(
    values.root ?? process.env.ROUTOGRAM_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );

  try {
    const summary = await runLint({
      root: lintRoot,
      configPath: values.config ?? process.env.ROUTOGRAM_CONFIG,
    });

    console.log(values.json ? JSON.stringify(summary, null, 2) : formatLintSummary(summary));
    process.exit(summary.errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error(`[lint] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const port = await findAvailablePort(resolvePort(values.port, "daemon"), "daemon");
// INIT_CWD preserves where pnpm was invoked, not the filtered package cwd.
// INIT_CWD giữ thư mục gọi pnpm, không phải cwd của package được filter.
const invocationRoot = process.env.INIT_CWD ?? process.cwd();
const root = resolve(values.root ?? process.env.ROUTOGRAM_ROOT ?? invocationRoot);

if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[daemon] Workspace root is not a directory: ${root}`);
  process.exit(1);
}

const projectConfig = await loadRoutogramConfig(
  root,
  values.config ?? process.env.ROUTOGRAM_CONFIG,
).catch((error: unknown): { config: RoutogramConfig; raw: Record<string, unknown>; path: null } => {
  console.error(`[config] ${error instanceof Error ? error.message : String(error)}`);
  return { config: {}, raw: {}, path: null };
});

const moduleDir = dirname(fileURLToPath(import.meta.url));
const canvasCandidates = [
  process.env.ROUTOGRAM_CANVAS_DIR,
  resolve(moduleDir, "../assets"),
  resolve(moduleDir, "../../canvas/dist"),
].filter((candidate): candidate is string => Boolean(candidate));
const canvasEnabled = !values["no-canvas"] && process.env.ROUTOGRAM_NO_CANVAS !== "1";
const canvasDir = canvasEnabled
  ? (canvasCandidates.find((candidate) => existsSync(resolve(candidate, "index.html"))) ?? null)
  : null;
const canvasPort = canvasDir
  ? await findAvailablePort(resolveCanvasPort(values["canvas-port"]), "canvas")
  : null;

const native = loadNativeCore();
const nativeVersion = native.core?.coreVersion() ?? null;
const incrementalScanner = native.core?.IncrementalScanner
  ? new native.core.IncrementalScanner()
  : null;
let nativeError = native.error;
let topology = createSampleTopology(root);
let topologySource: "native" | "sample" = "sample";
let runtimeSnapshot: RoutogramRuntimeSnapshot | null = null;

function refreshTopology(): boolean {
  if (!native.core) {
    return false;
  }

  try {
    const raw = incrementalScanner
      ? incrementalScanner.scan(root)
      : native.core.scanWorkspace(root);
    const scanned: unknown = JSON.parse(raw);

    if (!isRoutogramTopology(scanned)) {
      nativeError = "The native scanner returned an invalid topology payload.";
      return false;
    }

    topology = scanned;
    topologySource = "native";
    nativeError = null;
    return true;
  } catch (error) {
    nativeError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

refreshTopology();

function resolveEditorOpen(payload: Record<string, unknown> | null): {
  status: 200 | 400 | 403 | 404;
  body: Record<string, unknown>;
} {
  if (!payload || typeof payload.filePath !== "string" || payload.filePath.length === 0) {
    return { status: 400, body: { error: "A relative filePath is required." } };
  }

  const absolutePath = resolve(root, payload.filePath);
  const relativePath = relative(root, absolutePath);
  const firstSegment = relativePath.split(/[\\/]/)[0];

  if (firstSegment === ".." || isAbsolute(relativePath)) {
    return { status: 403, body: { error: "File path escapes the workspace root." } };
  }

  if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    return { status: 404, body: { error: "File not found." } };
  }

  const line = positiveInteger(payload.line) ?? 1;
  const column = positiveInteger(payload.column) ?? 1;
  const editor = normalizeEditor(payload.editor) ?? detectEditor();

  return {
    status: 200,
    body: {
      ok: true,
      editor,
      url: buildEditorUrl(editor, absolutePath, line, column),
      file: relativePath,
      line,
      column,
    },
  };
}

function nodeIdsForFile(file: string): string[] {
  return topology.nodes
    .filter((node) => node.file.replaceAll("\\", "/") === file)
    .map((node) => node.id);
}

function broadcastFocus(file: string, nodeIds: string[], source: "ide" | "watcher"): void {
  if (nodeIds.length === 0) {
    return;
  }

  broadcast({
    type: "FOCUS_NODE",
    payload: {
      nodeIds,
      file,
      source,
    },
  });
}

if (values.static) {
  if (!native.core) {
    console.error("[static] The native scanner is required for static export.");
    process.exit(1);
  }

  const outDir = resolve(root, values.out ?? DEFAULT_STATIC_OUT_DIR);

  try {
    runStaticExport({ root, outDir, topology });
    process.exit(0);
  } catch (error) {
    console.error(`[static] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const startedAt = Date.now();
const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-Routogram-Api-Key",
      "X-Routogram-Ai-Provider",
      "X-Routogram-Ai-Model",
      "X-Routogram-Ai-Base-Url",
    ],
  }),
);

if (!canvasDir) {
  app.get("/", (context) =>
    context.json({
      name: "routogram",
      version: ROUTOGRAM_VERSION,
      endpoints: [
        "/api/health",
        "/api/topology",
        "/api/git/timeline",
        "/api/runtime",
        "/api/ide/open",
        "/api/ide/focus",
        "/api/open-file",
        "/api/ai/audit",
        "/api/ai/query",
        "/api/ai/chat",
        "/api/config",
        "/api/config/ai",
        "/api/health/code",
        "/ws",
      ],
    }),
  );
}

app.get("/api/health", (context) =>
  context.json({
    ok: true,
    version: ROUTOGRAM_VERSION,
    native: native.core !== null,
    nativeVersion,
    nativeError,
    topologySource,
    schemaVersion: topology.schemaVersion,
    tokens: topology.tokens?.length ?? 0,
    workspace: topology.workspace?.tool ?? null,
    packages: topology.workspace?.packages.length ?? 0,
    runtime: runtimeSnapshot !== null,
    runtimeRoute: runtimeSnapshot?.route ?? null,
    root,
    uptimeMs: Date.now() - startedAt,
  }),
);

app.get("/api/topology", (context) => {
  context.header("Cache-Control", "no-store");
  context.header("X-Routogram-Source", topologySource);
  return context.json(topology);
});

app.get("/api/runtime", (context) => {
  context.header("Cache-Control", "no-store");
  return context.json({ snapshot: runtimeSnapshot });
});

app.get("/api/git/timeline", (context) => {
  if (!native.core?.scanGitTimeline) {
    return context.json({ error: "Git history is unavailable in this native/Wasm runtime." }, 503);
  }

  const limitValue = Number(context.req.query("limit") ?? 12);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 50) : 12;

  try {
    const raw = native.core.scanGitTimeline(root, limit);
    const timeline: unknown = JSON.parse(raw);

    if (!isRoutogramTimeline(timeline)) {
      return context.json({ error: "The native scanner returned an invalid timeline." }, 500);
    }

    return context.json(timeline);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.post("/api/ide/open", async (context) => {
  const payload = await context.req.json<Record<string, unknown>>().catch(() => null);
  const result = resolveEditorOpen(payload);

  return context.json(result.body, result.status);
});

app.post("/api/open-file", async (context) => {
  const payload = await context.req.json<Record<string, unknown>>().catch(() => null);
  const result = resolveEditorOpen(payload);

  return context.json(result.body, result.status);
});

app.post("/api/ide/focus", async (context) => {
  const payload = await context.req.json<Record<string, unknown>>().catch(() => null);

  if (!payload || typeof payload.filePath !== "string" || payload.filePath.length === 0) {
    return context.json({ error: "A relative filePath is required." }, 400);
  }

  const absolutePath = resolve(root, payload.filePath);
  const relativePath = relative(root, absolutePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return context.json({ error: "File path escapes the workspace root." }, 403);
  }

  if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    return context.json({ error: "File not found." }, 404);
  }

  const nodeIds = nodeIdsForFile(relativePath.replaceAll("\\", "/"));
  if (nodeIds.length === 0) {
    return context.json({ error: "No topology node is associated with this file." }, 404);
  }

  broadcastFocus(relativePath.replaceAll("\\", "/"), nodeIds, "ide");
  return context.json({ ok: true, file: relativePath, nodeIds });
});

app.route(
  "/api/ai",
  createAiRoutes(() => topology, { ai: projectConfig.config.ai }),
);

app.route(
  "/api/config",
  createConfigRoutes({
    raw: projectConfig.raw,
    ai: projectConfig.config.ai,
    configPath: projectConfig.path,
  }),
);

app.get("/api/health/code", (context) => context.json(analyzeCodeHealth(root, topology)));

app.route("/api/annotations", createAnnotationRoutes({ root }));

const federationRoots = (values.roots ?? process.env.ROUTOGRAM_ROOTS ?? root)
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const agentWsServer = new WebSocketServer({ noServer: true });
const agentManager = new AgentMissionManager(
  {
    query: (aql, limit) => {
      if (!native.core) {
        throw new Error("The native graph engine is unavailable.");
      }
      const index = native.core.buildGraphRag(root);
      return JSON.parse(native.core.queryGraphRag(index, aql, limit));
    },
    simulate: (operations) => {
      if (!native.core) {
        throw new Error("The native simulation engine is unavailable.");
      }
      return JSON.parse(
        native.core.simulateTopology(root, JSON.stringify(topology), JSON.stringify(operations)),
      );
    },
    previewMigration: (recipeId) => {
      if (!native.core) {
        throw new Error("The native migration engine is unavailable.");
      }
      return JSON.parse(native.core.runMigration(root, recipeId, false));
    },
    applyMigration: (recipeId) => {
      if (!native.core) {
        throw new Error("The native migration engine is unavailable.");
      }
      return JSON.parse(native.core.runMigration(root, recipeId, true));
    },
    previewRefactor: (recipeId, nodeId) => {
      if (!native.core) {
        throw new Error("The native refactor engine is unavailable.");
      }
      return JSON.parse(native.core.applyRefactor(root, recipeId, nodeId, true));
    },
    applyRefactor: (recipeId, nodeId) => {
      if (!native.core) {
        throw new Error("The native refactor engine is unavailable.");
      }
      return JSON.parse(native.core.applyRefactor(root, recipeId, nodeId, false));
    },
    verifyRulebook: () => {
      if (!native.core) {
        throw new Error("The native rulebook engine is unavailable.");
      }
      return JSON.parse(native.core.checkArchRulebook(root, "{}"));
    },
  },
  (event) => {
    const payload = JSON.stringify(event);
    for (const client of agentWsServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  },
);

agentWsServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "agent:snapshot", missions: agentManager.list() }));
  socket.on("error", (error) => {
    console.error(`[agent] client error: ${error.message}`);
  });
});

app.route("/api/agent", createAgentRoutes({ manager: agentManager }));

app.route(
  "/api/federation",
  createFederationRoutes({
    roots: federationRoots,
    run: (roots) => {
      if (!native.core) {
        throw new Error("The native federation engine is unavailable.");
      }
      return native.core.scanFederation(JSON.stringify(roots));
    },
  }),
);

app.route(
  "/api/migration",
  createMigrationRoutes({
    root,
    run: (workspaceRoot, recipeId, apply) => {
      if (!native.core) {
        throw new Error("The native migration engine is unavailable.");
      }
      return native.core.runMigration(workspaceRoot, recipeId, apply);
    },
    onApplied: () => {
      if (refreshTopology()) {
        broadcast({ type: "topology:invalidate", at: new Date().toISOString() });
      }
    },
    onPreview: () => {},
  }),
);

app.route("/api/drift", createDriftRoutes({ root }));

app.route(
  "/api/simulation",
  createSimulationRoutes({
    root,
    getTopology: () => topology,
    run: (workspaceRoot, topologyJson, operationsJson) => {
      if (!native.core) {
        throw new Error("The native simulation engine is unavailable.");
      }
      return native.core.simulateTopology(workspaceRoot, topologyJson, operationsJson);
    },
    onResult: (result) => {
      simulationResult = result;
      const payload = JSON.stringify({ type: "SIMULATION_UPDATE", payload: result });
      for (const client of simulationWsServer.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    },
  }),
);

app.route(
  "/api/graph",
  createGraphRoutes({
    root,
    build: (workspaceRoot) => {
      if (!native.core) {
        throw new Error("The native graph engine is unavailable.");
      }
      return native.core.buildGraphRag(workspaceRoot);
    },
    search: (index, queryText, limit, filters) => {
      if (!native.core) {
        throw new Error("The native graph engine is unavailable.");
      }
      return native.core.searchGraphRag(index, queryText, limit, filters);
    },
    query: (index, aql, limit) => {
      if (!native.core) {
        throw new Error("The native graph engine is unavailable.");
      }
      return native.core.queryGraphRag(index, aql, limit);
    },
    context: (index, nodeIds) => {
      if (!native.core) {
        throw new Error("The native graph engine is unavailable.");
      }
      return native.core.graphRagContext(index, nodeIds);
    },
  }),
);

app.route(
  "/api/refactor",
  createRefactorRoutes({
    root,
    run: (workspaceRoot, recipeId, targetNodeId, previewOnly) => {
      if (!native.core) {
        throw new Error("The native refactor engine is unavailable.");
      }

      return native.core.applyRefactor(workspaceRoot, recipeId, targetNodeId, previewOnly);
    },
    onApplied: () => {
      const refreshed = refreshTopology();
      if (refreshed) {
        broadcast({ type: "topology:invalidate", at: new Date().toISOString() });
      }
    },
  }),
);

if (canvasDir) {
  app.use("/*", serveStatic({ root: canvasDir }));
}

app.notFound((context) => context.json({ error: "Not found" }, 404));

const server = serve({ fetch: app.fetch, hostname: HOST, port }, () => {
  console.log(`\n  Routogram daemon v${ROUTOGRAM_VERSION}`);
  console.log(`  HTTP       http://${HOST}:${port}`);
  console.log(`  WebSocket  ws://${HOST}:${port}/ws`);
  console.log(`  Runtime    ws://${HOST}:${port}/ws/runtime`);
  if (canvasDir && canvasPort) {
    console.log(`  Canvas     http://${HOST}:${canvasPort}/`);
  }
  console.log(`  Root       ${root}`);
  console.log(
    `  Core       ${native.core ? `native v${nativeVersion}` : "sample fallback (bridge unavailable)"}`,
  );
  if (nativeError) {
    console.log(`  Bridge     ${nativeError}`);
  }
  if (topologySource === "sample" && native.core) {
    console.log("  Scanner    unavailable; serving the sample topology");
  }
  console.log(
    `  Graph      ${topologySource} (${topology.nodes.length} nodes, ${topology.edges.length} edges, ${topology.tokens?.length ?? 0} tokens)\n`,
  );
});

const canvasServer =
  canvasDir && canvasPort
    ? (() => {
        const canvasApp = new Hono();
        const indexHtml = readFileSync(resolve(canvasDir, "index.html"), "utf8");
        const bootstrap = `<script>window.__ROUTOGRAM_DAEMON_URL__=${JSON.stringify(
          `http://${HOST}:${port}`,
        )};</script>`;
        const rendered = indexHtml.replace("<head>", `<head>\n    ${bootstrap}`);
        canvasApp.get("/", (context) => context.html(rendered));
        canvasApp.use("/*", serveStatic({ root: canvasDir }));

        return serve({ fetch: canvasApp.fetch, hostname: HOST, port: canvasPort }, () => {});
      })()
    : null;

if (canvasServer && (values.open || !values["no-open"])) {
  openBrowser(`http://${HOST}:${canvasPort}/`);
} else if (!canvasServer && (values.open || !values["no-open"])) {
  openBrowser(`http://${HOST}:${port}/`);
}

// WebSocket upgrades need an HTTP/1 server, not Hono's HTTP/1-or-HTTP/2 union.
// Nâng cấp WebSocket cần server HTTP/1, không phải union HTTP/1-hoặc-HTTP/2 của Hono.
if (!(server instanceof HttpServer)) {
  throw new Error("Routogram requires an HTTP/1 server for WebSocket upgrades.");
}

const wsServer = new WebSocketServer({ noServer: true });
const runtimeWsServer = new WebSocketServer({ noServer: true });
const collabServer = createCollabServer();
const simulationWsServer = new WebSocketServer({ noServer: true });
let simulationResult: unknown = null;

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (pathname === "/ws") {
    wsServer.handleUpgrade(request, socket, head, (client) => {
      wsServer.emit("connection", client, request);
    });
    return;
  }

  if (pathname === "/ws/agent") {
    agentWsServer.handleUpgrade(request, socket, head, (client) => {
      agentWsServer.emit("connection", client, request);
    });
    return;
  }

  if (pathname === "/ws/simulation") {
    simulationWsServer.handleUpgrade(request, socket, head, (client) => {
      simulationWsServer.emit("connection", client, request);
    });
    return;
  }

  if (pathname === "/ws/collab") {
    collabServer.upgrade(request, socket, head);
    return;
  }

  if (pathname === "/ws/runtime") {
    runtimeWsServer.handleUpgrade(request, socket, head, (client) => {
      runtimeWsServer.emit("connection", client, request);
    });
    return;
  }

  socket.destroy();
});

wsServer.on("connection", (socket) => {
  const snapshot: RoutogramServerEvent = { type: "topology:snapshot", topology };
  socket.send(JSON.stringify(snapshot));

  if (runtimeSnapshot) {
    socket.send(JSON.stringify({ type: "RUNTIME_UPDATE", payload: runtimeSnapshot }));
  }

  socket.on("error", (error) => {
    console.error(`[ws] client error: ${error.message}`);
  });
});

simulationWsServer.on("connection", (socket) => {
  if (simulationResult) {
    socket.send(JSON.stringify({ type: "SIMULATION_UPDATE", payload: simulationResult }));
  }
  socket.on("error", (error) => {
    console.error(`[simulation] client error: ${error.message}`);
  });
});

runtimeWsServer.on("connection", (socket) => {
  console.log("[runtime] client connected");

  socket.on("message", (raw) => {
    try {
      const message: unknown = JSON.parse(raw.toString());

      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message as { type?: unknown }).type === "runtime:snapshot" &&
        "payload" in message &&
        isRoutogramRuntimeSnapshot((message as { payload?: unknown }).payload)
      ) {
        runtimeSnapshot = (message as { payload: RoutogramRuntimeSnapshot }).payload;
        broadcast({ type: "RUNTIME_UPDATE", payload: runtimeSnapshot });
      }
    } catch {
      // Ignore malformed runtime telemetry without terminating the session.
      // Bỏ qua telemetry runtime sai định dạng mà không kết thúc session.
    }
  });

  socket.on("close", () => {
    console.log("[runtime] client disconnected");
  });
  socket.on("error", (error) => {
    console.error(`[runtime] client error: ${error.message}`);
  });
});

function broadcast(event: RoutogramServerEvent): void {
  const payload = JSON.stringify(event);

  for (const client of wsServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function checkDrift(previous: typeof topology): void {
  const findings = detectDrift(root, previous, topology);
  if (findings.length === 0) {
    return;
  }
  const payload = { findings, at: new Date().toISOString() };
  broadcast({ type: "CRITICAL_DRIFT_DETECTED", payload });
  notifyDrift(payload);
}

function applyIncrementalUpdate(filename: string | null): boolean {
  if (!incrementalScanner || topologySource !== "native") {
    return false;
  }

  try {
    const raw = incrementalScanner.update(root, filename ? [filename] : []);
    const patch: unknown = JSON.parse(raw);

    if (!isRoutogramTopologyPatch(patch)) {
      throw new Error("The native scanner returned an invalid topology patch.");
    }

    topology = applyTopologyPatch(topology, patch);
    nativeError = null;
    broadcast({ type: "PATCH_TOPOLOGY", payload: patch });
    console.log(
      `[watch] ${filename ?? "workspace"} patched (${patch.updatedNodes.length} updated nodes, ${patch.removedNodeIds.length} removed)`,
    );
    return true;
  } catch (error) {
    nativeError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

const stopWatcher = values["no-watch"]
  ? null
  : startWatcher(root, (filename) => {
      const changedFile = filename ?? "workspace";
      const previous = JSON.parse(JSON.stringify(topology)) as typeof topology;

      if (applyIncrementalUpdate(filename)) {
        checkDrift(previous);
        if (process.env.ROUTOGRAM_FOCUS_ON_CHANGE === "1" && filename) {
          broadcastFocus(
            filename.replaceAll("\\", "/"),
            nodeIdsForFile(filename.replaceAll("\\", "/")),
            "watcher",
          );
        }
        return;
      }

      if (refreshTopology()) {
        checkDrift(previous);
        broadcast({ type: "topology:snapshot", topology });
        console.log(
          `[watch] ${changedFile} changed; topology rescanned (${topology.nodes.length} nodes)`,
        );
        if (process.env.ROUTOGRAM_FOCUS_ON_CHANGE === "1" && filename) {
          broadcastFocus(
            filename.replaceAll("\\", "/"),
            nodeIdsForFile(filename.replaceAll("\\", "/")),
            "watcher",
          );
        }
      } else {
        broadcast({ type: "topology:invalidate", at: new Date().toISOString() });
        console.log(`[watch] ${changedFile} changed; invalidation broadcast`);
      }
    });

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`\n[daemon] ${signal} received, shutting down`);
  stopWatcher?.();

  for (const client of wsServer.clients) {
    client.terminate();
  }
  for (const client of runtimeWsServer.clients) {
    client.terminate();
  }

  wsServer.close();
  runtimeWsServer.close();
  collabServer.close();
  simulationWsServer.close();
  agentWsServer.close();
  canvasServer?.close();

  if (values.report) {
    try {
      writeSessionReport();
    } catch (error) {
      console.error(`[report] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error(`[daemon] server error: ${error.message}`);
  process.exitCode = 1;
});

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Opening a browser is best-effort; the daemon still serves the URL.
    // Mở trình duyệt chỉ là best-effort; daemon vẫn phục vụ URL.
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function resolvePort(rawPort: string | undefined, label: string): number {
  const fallback = label === "canvas" ? DEFAULT_CANVAS_PORT : DEFAULT_PORT;
  const environment =
    label === "canvas" ? process.env.ROUTOGRAM_CANVAS_PORT : process.env.ROUTOGRAM_PORT;
  const portValue = Number(rawPort ?? environment ?? fallback);

  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error(`Invalid ${label} port: ${String(rawPort)}`);
  }

  return portValue;
}

function resolveCanvasPort(rawPort: string | undefined): number {
  return resolvePort(rawPort, "canvas");
}

async function findAvailablePort(preferredPort: number, label: string): Promise<number> {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = preferredPort + offset;

    if (candidate > 65_535) {
      break;
    }
    if (await isPortAvailable(candidate)) {
      if (candidate !== preferredPort) {
        console.log(`[${label}] port ${preferredPort} is busy; using ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error(`No available ${label} port near ${preferredPort}.`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolveProbe(false));
    probe.listen(port, HOST, () => {
      probe.close(() => resolveProbe(true));
    });
  });
}

function writeSessionReport(): void {
  const output = resolve(invocationRoot, "routogram-report.html");
  const template = canvasDir ? resolve(canvasDir, "report-template.html") : null;

  if (template && existsSync(template)) {
    const html = readFileSync(template, "utf8");
    const payload = JSON.stringify(topology)
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
    const marker = "window.__ROUTOGRAM_DATA__ = ";
    const start = html.indexOf(marker);
    const end = html.indexOf(";</script>", start);

    if (start < 0 || end < 0) {
      throw new Error("The bundled report template is missing its topology marker.");
    }

    writeFileSync(output, `${html.slice(0, start + marker.length)}${payload}${html.slice(end)}`);
    console.log(`[report] wrote ${output}`);
    return;
  }

  const directory = mkdtempSync(join(tmpdir(), "routogram-report-"));

  try {
    runStaticExport({ root, outDir: directory, topology });
    renameSync(join(directory, "index.html"), output);
    console.log(`[report] wrote ${output}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Watcher events are debounced because editors emit bursts of filesystem writes.
// Sự kiện watcher được debounce vì editor phát ra nhiều lần ghi liên tiếp.
function startWatcher(watchRoot: string, onChange: (filename: string | null) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const watcher = watch(watchRoot, { recursive: true }, (_event, filename) => {
      const changedFile = filename?.toString() ?? null;

      if (changedFile && isIgnoredPath(changedFile)) {
        return;
      }

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        onChange(changedFile);
      }, 250);
    });

    watcher.on("error", (error) => {
      console.error(`[watch] watcher error: ${error.message}`);
    });

    console.log(`[watch] observing ${watchRoot}`);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      watcher.close();
    };
  } catch (error) {
    console.error(
      `[watch] filesystem watching disabled: ${error instanceof Error ? error.message : String(error)}`,
    );
    return () => {};
  }
}

function isIgnoredPath(relativePath: string): boolean {
  if (relativePath.endsWith(".DS_Store")) {
    return true;
  }

  return relativePath.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment));
}

function printHelp(): void {
  console.log(`routogram ${ROUTOGRAM_VERSION}

Usage:
  routogram [options]
  routogram diff --base <ref> --head <ref> [--format markdown|json]
  routogram lint [--config <path>] [--json]
  routogram test-arch [--config <path>] [--format markdown|sarif]
  routogram graph index [--out .routogram/graph-rag.json]
  routogram graph search <query> [--aql] [--limit <n>] [--json]
  routogram graph context <nodeId...> [--json]
  routogram publish --project <name> --release <version> [--hub <url>]
  routogram snapshot [--out <dir>] [--json]
  routogram report [--format markdown|json] [--out ARCHITECTURE.md]
  routogram lsp --stdio [--root <path>]

Options:
  -p, --port <port>   Local daemon port (default: ${DEFAULT_PORT})
  -r, --root <path>   Workspace root to scan (default: invocation directory)
      --no-watch      Disable the filesystem watcher
      --no-open       Do not open the browser on startup
      --open          Open the browser explicitly
      --no-canvas     Do not serve the bundled canvas (dev mode)
      --canvas-port <port>  Canvas static server port (default: 6060)
      --report        Write routogram-report.html when the session ends
      --static        Export a standalone static topology viewer
  -o, --out <path>    Static export directory (default: routogram-report)
  -h, --help          Show this help
  -v, --version       Print the CLI version

Publish options:
      --project <name>         Project slug (default: workspace folder)
      --release <version>      Snapshot version, e.g. v2.4.0
      --hub <url>              Self-hosted Hub base URL
      --token <token>          Hub bearer token
      --upload-url <url>       Presigned S3/R2 PUT URL
      --public-url <url>       Public URL to print after upload
      --out <dir>              Local snapshot directory

Graph options:
      --out <path>             Graph index output path
      --aql                    Treat the search string as AQL
      --limit <n>              Maximum graph results (default: 12)
      --json                   Emit raw JSON

Rulebook options:
      --config <path>          .routogramrc.json or routogram.rulebook.ts
      --format markdown|sarif  Rulebook report format (default: markdown)

Lint options:
      --config <path>          routogram.config.ts/js path
      --json                   Print lint diagnostics as JSON

Diff options:
      --base <ref>             Base git commit (default: origin/main)
      --head <ref>             Head git commit (default: HEAD)
      --format <markdown|json> Report output format (default: markdown)
      --fail-on-dead-css       Fail the gate when new Dead CSS is introduced
      --max-blast-radius <n>   Allowed blast warnings per component (default: 3)

Environment:
  ROUTOGRAM_PORT      Default daemon port
  ROUTOGRAM_CANVAS_PORT  Default canvas static port
  ROUTOGRAM_ROOT      Default workspace root
  ROUTOGRAM_CANVAS_DIR  Override the bundled canvas directory
  ROUTOGRAM_CONFIG      Default routogram.config.* path
  ROUTOGRAM_RULEBOOK    Default .routogramrc.json / routogram.rulebook.* path
  ROUTOGRAM_EDITOR      vscode | cursor | vscode-insiders | zed | webstorm | intellij
  ROUTOGRAM_FOCUS_ON_CHANGE  Emit FOCUS_NODE for files changed by the watcher
  OPENAI_API_KEY      OpenAI provider key for Copilot
  DEEPSEEK_API_KEY    DeepSeek provider key for Copilot
  ANTHROPIC_API_KEY   Anthropic provider key for Copilot
  OLLAMA_BASE_URL     Local Ollama base URL

Endpoints:
  GET  /api/health        Daemon and native bridge status
  GET  /api/topology      Current topology snapshot
  GET  /api/git/timeline  Git history topology snapshots and diffs
  GET  /api/runtime       Latest runtime telemetry snapshot
  POST /api/ide/open      Resolve a workspace file into an editor URI
  POST /api/ide/focus     Focus the canvas on a workspace file
  POST /api/open-file     Backward-compatible editor URI resolver
  POST /api/ai/audit      Architecture health audit using a BYOK model
  POST /api/ai/query      Semantic topology query with node highlighting
  WS   /ws                Topology snapshots and invalidation events`);
}

function findLspBinary(): string | null {
  const extension = process.platform === "win32" ? ".exe" : "";
  const binaryDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ROUTOGRAM_LSP_BIN,
    resolve(binaryDir, "../assets/bin", `routogram-lsp${extension}`),
    resolve(process.cwd(), "target/release", `routogram-lsp${extension}`),
    resolve(process.cwd(), "target/debug", `routogram-lsp${extension}`),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
