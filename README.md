# routogram

Interactive architectural topology and navigation graph for modern codebases.

Routogram scans a frontend or fullstack workspace, models its architecture as a typed
graph, and renders that graph as an explorable navigation canvas. **Phase 10** adds federated
multi-repo topology, a universal stdio LSP gateway, and an autonomous architecture agent with
human approval. **Phase 9** provides shadow simulation and migration sandboxes; **Phase 8**
provides the knowledge graph/AQL, annotations, cloud snapshots, and multiplayer.

## Architecture

```text
┌─────────────────────────────┐
│ crates/routogram-core       │  Rust + oxc_parser + LightningCSS
│ AST + style analyzer        │  scan_workspace() → topology JSON
└──────────────┬──────────────┘
               │ NAPI-RS bridge
┌──────────────▼──────────────┐        HTTP /api/*        ┌────────────────────────┐
│ packages/cli                │◄─────────────────────────►│ packages/canvas        │
│ Hono daemon on :4040        │ snapshot / PATCH / FOCUS  │ :6060 static + Vite    │
│ runtime / git / refactor    │      / RUNTIME_UPDATE      │ runtime + timeline UI  │
│ rulebook / Auto-Fix         │      / REFACTOR diff       │ DiffModal + inspector  │
└──────────────┬──────────────┘                           └────────────────────────┘
               │ imports
┌──────────────▼──────────────┐
│ packages/types              │  shared TypeScript topology contract
└─────────────────────────────┘
```

## Workspace orchestration

Routogram keeps two independent package graphs:

- **pnpm** manages only `packages/*`.
- **Cargo** manages only `crates/*`.
- `packages/cli` keeps a local `devDependency` link to `crates/routogram-core` for the NAPI
  addon; this link is local-only and is not part of the published CLI dependency graph.
- Native builds run through the root dev tooling:

```bash
pnpm build:native        # NAPI addon, output in crates/routogram-core
pnpm build:native:debug  # debug addon for pnpm dev
pnpm build:core          # cargo build --release --workspace
```

This is why `pnpm -r exec tsc --noEmit` no longer visits the Rust crate. The canonical
coordinator is:

```bash
pnpm typecheck
# equivalent to: pnpm build:types && pnpm -r --filter "./packages/**" exec tsc --noEmit
```

`pnpm build` runs native, TypeScript packages, canvas assets, report template and LSP binary in
one command. `pnpm verify` runs lint, typecheck and Rust tests.

## Workspace layout

| Path                        | Package                 | Responsibility                                     |
| --------------------------- | ----------------------- | -------------------------------------------------- |
| `crates/routogram-core`     | `@routogram/core`       | Rust static analysis engine and NAPI-RS bindings   |
| `packages/types`            | `@routogram/types`      | Shared topology schema, guards, and layer metadata |
| `packages/cli`              | `routogram`             | CLI, local Hono daemon, runtime/git APIs, reports  |
| `packages/client`           | `@routogram/client`     | Dev-only React/Network telemetry bridge            |
| `packages/canvas`           | `@routogram/canvas`     | Vite + React + Tailwind visualization client       |
| `packages/vscode-extension` | `routogram-vscode`      | VS Code / Cursor webview, CodeLens, commands       |
| `packages/cloud-sync`       | `@routogram/cloud-sync` | Anonymized snapshot packaging and upload adapters  |

## Prerequisites

- Node.js >= 22.13
- pnpm >= 12.14
- Rust >= 1.97 with Cargo (required by `oxc_ast_visit` 0.156)

## Getting started

```bash
pnpm install
pnpm build
pnpm dev
```

`pnpm dev` builds the shared types, compiles a debug native addon, then starts:

- CLI daemon: http://127.0.0.1:4040
- Canvas UI: http://127.0.0.1:6060

The Vite dev server runs on port 6060 and proxies `/api` and `/ws` to the daemon on 4040.
`ROUTOGRAM_PORT` overrides the daemon port.

For the packaged flow, build once and run the CLI:

```bash
pnpm build
pnpm routogram
```

`pnpm build` builds the canvas and copies it into `packages/cli/assets`. The CLI starts the
daemon on `http://127.0.0.1:4040`, serves the canvas on `http://127.0.0.1:6060`, and opens the
browser automatically. If either port is busy, the next free port is selected. Use `--no-open`
or `--open`, `--canvas-port`, and `ROUTOGRAM_CANVAS_DIR` to control this behavior.

The published package can be invoked directly:

```bash
npx routogram
npm install -g routogram
routogram --report   # writes routogram-report.html on exit
```

### Endpoints

| Endpoint                    | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `GET /api/health`           | Daemon, watcher, and native bridge status              |
| `GET /api/topology`         | Current topology snapshot with workspace metadata      |
| `GET /api/git/timeline`     | Git history snapshots and topology diffs               |
| `GET /api/runtime`          | Latest browser runtime telemetry snapshot              |
| `GET /api/graph/stats`      | Graph RAG index size, dimensions, embedding model      |
| `POST /api/graph/index`     | Build the knowledge graph; optionally write JSON       |
| `POST /api/graph/search`    | Semantic search or AQL query                           |
| `POST /api/graph/context`   | Neighborhood context for Graph RAG prompts             |
| `GET/POST /api/annotations` | Repo-backed architecture pins and ADR annotations      |
| `WS /ws/collab`             | Multiplayer cursors, presence, presenter viewport      |
| `POST /api/ide/open`        | Resolve a file into a VS Code/Cursor/Zed/JetBrains URI |
| `POST /api/ide/focus`       | Broadcast `FOCUS_NODE` for an IDE-selected file        |
| `POST /api/open-file`       | Backward-compatible editor URI resolver                |
| `WS /ws`                    | Snapshots, patches, `FOCUS_NODE`, `RUNTIME_UPDATE`     |
| `WS /ws/runtime`            | Runtime client telemetry ingress                       |

### Useful commands

| Command                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `pnpm lint`            | Biome lint and formatting check                               |
| `pnpm lint:fix`        | Biome safe fixes and formatting                               |
| `pnpm typecheck`       | TypeScript checks across all TS packages                      |
| `pnpm test`            | Rust unit tests for the analyzers                             |
| `pnpm build`           | Types + native/client/CLI + canvas + assets + report template |
| `pnpm build:native`    | Rust addon only                                               |
| `pnpm build:client`    | Runtime telemetry client only                                 |
| `pnpm build:cloud`     | Cloud snapshot package only                                   |
| `pnpm build:extension` | VS Code / Cursor extension                                    |
| `pnpm routogram`       | Run the packaged two-port daemon                              |
| `pnpm clean`           | Remove `node_modules` and build artifacts                     |

### Static export

Build once, then export a single self-contained HTML file with an embedded topology snapshot:

```bash
pnpm build
node packages/cli/dist/index.js --static --out ./routogram-report
```

`routogram-report/index.html` contains inlined JS, CSS, and `window.__ROUTOGRAM_DATA__`; it works
from `file://` with no server. `routogram-report/topology.json` is emitted alongside it for CI checks.
The static viewer is read-only and disables the daemon-backed editor and AI copilot.

### AI Architecture Copilot (BYOK)

Configure a provider in the Copilot modal. Keys are kept in browser `localStorage` only and
sent to the local daemon as a transient header; the daemon does not persist them. The daemon
can also read provider keys from environment variables:

| Provider  | Environment         | Default endpoint              |
| --------- | ------------------- | ----------------------------- |
| OpenAI    | `OPENAI_API_KEY`    | `https://api.openai.com/v1`   |
| DeepSeek  | `DEEPSEEK_API_KEY`  | `https://api.deepseek.com/v1` |
| Anthropic | `ANTHROPIC_API_KEY` | `https://api.anthropic.com`   |
| Ollama    | `OLLAMA_BASE_URL`   | `http://127.0.0.1:11434/v1`   |

The API accepts `x-routogram-api-key`, `x-routogram-ai-provider`, `x-routogram-ai-model`, and
`x-routogram-ai-base-url` headers. The Rust topology is supplied to the model by the daemon;
the client never sends graph data. The AI returns validated JSON only, and every returned
`nodeIds` entry is filtered against real topology node IDs before it can drive highlighting.

## Architecture gate

Compare two git refs in isolated worktrees and emit a Markdown or JSON report:

```bash
pnpm build
node packages/cli/dist/index.js diff --base origin/main --head HEAD
node packages/cli/dist/index.js diff --base origin/main --head HEAD --format json
```

The gate reports added/removed routes, layouts, components, API boundaries, and stylesheets,
plus new Dead CSS, client→server boundary violations, and components above the blast-radius
threshold. It exits non-zero on new boundary violations, new blast-radius violations, or new
Dead CSS when `--fail-on-dead-css` is supplied. `.github/workflows/routogram-gate.yml` runs the
same command on pull requests, comments the table on the PR, and fails the check when the gate
fails. If `routogram.config.*` exists, the workflow also runs `routogram lint` before the diff.
`.github/workflows/release-napi.yml` builds macOS x64/arm64, Linux x64/arm64 glibc and musl,
Windows x64, and WASI prebuilds.

## Phase 10 capabilities

### Federated multi-repo topology

`crates/routogram-core/src/federation/mod.rs`:

- Scans multiple independent roots and prefixes node/edge IDs by app.
- Parses `modulefederation.config.*`, `module-federation.config.*`, Vite/Webpack config
  `remotes` declarations.
- Emits remote-container nodes and `dynamic_imports` edges.
- Compares shared React/Vue/Next versions and duplicate state stores.
- Returns `apps`, `remotes`, `sharedDependencies`, and `conflicts`.

Start the daemon with multiple roots:

```bash
ROUTOGRAM_ROOTS=/repos/shell,/repos/checkout,/repos/backend routogram
# or: routogram --roots /repos/shell,/repos/checkout
```

`GET /api/federation` returns the federated topology. The Canvas header exposes a Federation
switcher when more than one app is present, including conflict count.

### Universal LSP gateway

- Rust [lsp/mod.rs](crates/routogram-core/src/lsp/mod.rs) uses `tower-lsp`.
- Stdio binary: `routogram lsp --stdio`.
- Supports diagnostics for dead CSS and circular dependencies, hover summaries, and Quick Fix
  code actions that open a Routogram preview command.
- The binary is bundled into `packages/cli/assets/bin/routogram-lsp` by `pnpm build:lsp`.
- Works with any LSP client: Neovim, Helix, Zed, Emacs, Sublime, VS Code.

### Autonomous architecture agent

- `packages/cli/src/agent/mod.ts` exposes tool calls:
  - `query_topology`
  - `simulate_refactor`
  - `preview/apply_ast_mutation`
  - `verify_rulebook`
- Plans based on goals such as token migration, component splitting, deletion/impact review.
- Previews in the sandbox, emits a live event stream on `/ws/agent`, and pauses at
  `awaiting-approval`.
- Approval applies the patch and runs rulebook verification.
- Canvas [AgentDrawer](packages/canvas/src/app/features/topology/components/agent-drawer/index.tsx)
  shows the mission timeline, pending files, and Approve/Reject controls.
- `useAgentStore` (Zustand) holds mission/event state.

## Phase 9 capabilities

### Shadow graph simulator

`crates/routogram-core/src/simulation/mod.rs` forks the topology in memory and supports:

- `delete-node` with orphan detection, broken edges, lost tokens, layout/route breakpoints.
- `flip-boundary` with client subtree expansion and estimated client bundle delta.
- `migrate-router` for Pages → App Router and React Router → TanStack mappings.
- `prune-orphans` for unreachable component pruning.

```bash
curl -X POST http://127.0.0.1:4040/api/simulation/mutate \
  -H 'content-type: application/json' \
  -d '{"operations":[{"type":"delete-node","nodeIds":["component:src/App.tsx"]}]}'
```

The daemon broadcasts results on `/ws/simulation`. Canvas `SimulationBar` toggles the amber
Shadow Graph mode, runs scenarios, and `ImpactModal` shows affected nodes, broken edges,
orphan components, bundle delta, and potential breakpoints. The projected topology can replace
the live canvas for review without source mutation.

### Migration sandbox

`crates/routogram-core/src/migration/mod.rs` provides:

- **CSS-to-tokens**: nearest design-token color match using CIE Lab Delta E < 2.0, plus exact
  `px` spacing-token matching. Preview returns unified diffs; `apply: true` writes atomically.
- **Dead module pruner**: removes orphan component files only in explicit apply mode.

`POST /api/migration/scan` returns a dry-run `MigrationResult` with file diffs, bytes saved, and
projected topology. Canvas scenario menu exposes both recipes.

### Drift immunity and self-healing

`packages/cli/src/watcher/drift.ts` checks every watcher update for:

- New circular component dependencies.
- Client components importing `server-only`/server-secret modules.

New findings broadcast `CRITICAL_DRIFT_DETECTED`, print a terminal alert, and trigger a desktop
notification. `DriftBanner` surfaces them on Canvas. `POST /api/drift/heal` with
`{ "action": "revert", "files": [...] }` performs an explicit `git checkout` revert; the banner
requires confirmation by button click.

### Simulation UI

- `useSimulationStore` (Zustand) owns sandbox state, projected topology, loading/error, and impact
  modal state.
- `SimulationBar` scenarios: App Router migration, TanStack migration, orphan pruning, strict
  token migration, dead-module pruning, delete selected, flip client.
- `ImpactModal` summarizes affected nodes, broken edges, orphans, bundle delta, breakpoints, and
  migration files.

## Phase 8 capabilities

### Architectural knowledge graph and Graph RAG

`crates/routogram-core/src/graph_rag/mod.rs` turns topology into deterministic documents:

- Every node gets a context document containing kind, layer, route, runtime, package, child
  count, inbound/outbound relationships, consumed tokens, API calls, and dead CSS.
- Every edge and design token gets its own document.
- Documents carry 384-dimensional local feature-hash embeddings (`routogram-hash-v1`) and
  adjacency metadata. No external model or API key is required.

```bash
routogram graph index --out .routogram/graph-rag.json
routogram graph search "client component consuming orders API"
routogram graph context component:src/App.tsx --json
```

The JSON is a portable local vector index; the daemon exposes `/api/graph/*` and can write
`.routogram/graph-rag.json` for an external SQLite-vec/pgvector loader.

AQL is evaluated in Rust over the same index:

```text
MATCH (r:Route) -> (c:Component)
WHERE c.isClient = true AND c.depth > 4
RETURN c LIMIT 20

MATCH (c:Component) -[:calls_api]-> (a:ApiBoundary)
WHERE NOT EXISTS (r:RouteGuard)
RETURN c
```

Supported operators: `MATCH`, node labels, `->`, `-[:edge]->`, `WHERE`, `AND`, `OR`, `NOT`,
`EXISTS`, comparisons (`=`, `!=`, `>`, `>=`, `<`, `<=`, `CONTAINS`), `RETURN`, and `LIMIT`.
Path traversal is bounded to four hops.

### Team annotations and ADRs

- Annotations live in [`.routogram/annotations.json`](.routogram/annotations.json), so they are
  versioned with the repository.
- Canvas pins support notes, authors, colors, ADR links, and freeform boundary regions.
- API: `GET/POST /api/annotations`, `PATCH/DELETE /api/annotations/:id`.
- Annotation changes are polled by the Canvas so teammates converge while a review is open.

### Cloud snapshot publishing

```bash
routogram publish --project web-app --release v2.4.0
routogram snapshot --project web-app --release v2.4.0 --out .routogram/snapshots
routogram publish --project web-app --release v2.4.0 \
  --hub https://arch.yourcompany.internal --token "$ROUTOGRAM_HUB_TOKEN"
```

- `@routogram/cloud-sync` packages topology + annotations and scrubs absolute workspace paths
  and sensitive metadata keys.
- Upload adapters:
  - Hub: `PUT /api/projects/:project/snapshots/:version` with optional bearer token.
  - S3/R2: presigned `PUT` via `--upload-url` / `ROUTOGRAM_HUB_UPLOAD_URL`.
  - Local: `.routogram/snapshots/`.
- Environment: `ROUTOGRAM_HUB_URL`, `ROUTOGRAM_HUB_TOKEN`, `ROUTOGRAM_HUB_UPLOAD_URL`,
  `ROUTOGRAM_HUB_PUBLIC_URL`, `ROUTOGRAM_RELEASE`.

### Multiplayer canvas

- `packages/cli/src/routes/collab.ts` runs a WebSocket room at `/ws/collab`.
- Presence: names, colors, cursors, presenter state.
- Presenter Mode: the presenter's pan/zoom viewport is broadcast; followers apply it.
- Canvas `CollaboratorCursors` renders peer cursors and a review presence pill.
- `AnnotationLayer` renders pins, ADR cards, freeform boundary regions, and a two-node coupling
  meter (shortest graph path + package-boundary count).

### Auto-generated architecture digest

```bash
routogram report --format markdown
routogram report --format markdown --out ARCHITECTURE.md
```

The generated document includes:

- Mermaid routing map plus text route tree.
- Client/server component boundary tables.
- Design-token coverage and consumers.
- Dead CSS and blast-radius warning tables.
- Rulebook CI command.

## Phase 7 capabilities

### Autonomous AST refactoring

- `crates/routogram-core/src/refactor/mod.rs` plans source edits, formats generated TSX with
  `oxc_codegen`, and returns unified diffs without touching disk in preview mode.
- `POST /api/refactor/apply` accepts:

```json
{
  "recipeId": "prune-dead-css",
  "targetNodeId": "component:src/App.tsx",
  "previewOnly": true
}
```

- Preview returns `diff`, `files`, `warnings`, `changed`, and `applied`. Apply re-reads each file
  and refuses to commit if the content changed after preview.
- Recipes:
  - **Prune Dead CSS** removes simple `.module.css` class rules that are unused by every
    component importing the stylesheet.
  - **Extract Component Boundary** moves the top-level JSX return into
    `<component-dir>/components/<name>-view.tsx`, copies imports, destructures referenced local
    values as props, and inserts the import plus `<NameView ... />`.
  - **Safe Server/Client Split** inserts `"use client"` for client-hook files or `"use server"`
    for server actions when no conflicting directive exists.
- Canvas opens `DiffModal` before writing. Green/red lines show additions and removals; the
  Apply button commits only after the daemon has produced a valid preview.
- Source files are written atomically via a temporary file + rename.

### Architecture rulebook for CI

Create `.routogramrc.json` or `routogram.rulebook.ts`:

```json
{
  "boundaries": [{ "from": "@repo/web", "deny": ["@repo/internal-db"] }],
  "maxDepth": 6,
  "tokens": {
    "prefix": "--zl-",
    "forbidHardcodedValues": true
  }
}
```

Rules:

- **Boundary enforcement** reads cross-package topology edges and rejects denied package imports.
- **Component depth guard** rejects component chains deeper than `maxDepth` (root depth is 1).
- **Strict token isolation** requires token names to use the configured prefix and rejects
  hardcoded hex colors / `px` values in component and stylesheet files.

Run headless:

```bash
routogram test-arch
routogram test-arch --format sarif > routogram.sarif
routogram test-arch --config .routogramrc.json
```

The command exits `1` when errors exist. SARIF output is compatible with GitHub Code Scanning.
The rulebook is evaluated in Rust over the same topology as the canvas.

### VS Code / Cursor extension

`packages/vscode-extension` contributes:

- **Routogram Activity Bar view**: embeds the local canvas (`:6060`) in a dark webview and keeps
  it focused on the active editor file via the daemon (`:4040`).
- **CodeLens** above components: child count, consumed tokens, and dead CSS count.
- **Command Palette**:
  - `Routogram: Show Component Blast Radius`
  - `Routogram: Open Full Canvas in Browser`
- Active-file sync calls `/api/ide/focus`, which broadcasts `FOCUS_NODE` to the canvas.
- Start `routogram` before opening the view; daemon and canvas URLs are configurable.

## Phase 6 capabilities

### Live runtime overlay

- `@routogram/client` installs a React DevTools/Fiber commit observer, tracks render counts and
  recent render spikes, measures `fetch`/XHR request and response payload sizes, and follows
  `history.pushState`/`popstate` route changes.
- The client connects to `ws://127.0.0.1:4040/ws/runtime`. The daemon validates and rebroadcasts
  snapshots as `RUNTIME_UPDATE` on the normal canvas `/ws` channel.
- The canvas renders a live route pulse, green/amber/red re-render heat borders, render counters,
  and API payload sizes on network boundary edges. `RuntimeOverlay` shows the active route,
  hot-component count, request count, and total payload.
- The client is development-only by design; initialize it behind `import.meta.env.DEV` and never
  import it into the production bundle:

```ts
import { initRoutogramRuntime } from "@routogram/client";

if (import.meta.env.DEV) {
  initRoutogramRuntime({ daemonUrl: "http://127.0.0.1:4040" });
}
```

### Git architecture timeline

- `crates/routogram-core/src/git/mod.rs` uses `git2` to walk first-parent commits without
  touching the working directory, extracts each tree into a temporary workspace, and scans the
  topology at every step.
- `GET /api/git/timeline?limit=12` returns ordered `TimelineStep` records with commit metadata,
  full topology snapshots, and node/edge add/remove/update diffs.
- The canvas timeline slider replays historical snapshots, colors added nodes/edges green,
  shows removed nodes as red ghost nodes, and charts component/route/token growth. The timeline
  can be scrubbed, played, refreshed, or returned to Live.
- `git2` is optional at compile time so the WASI build can exclude libgit2; Git history is
  unavailable in a Wasm-only fallback.

### Release and distribution

- `packages/cli/bin/routogram.js` is the npm `bin` entry; `packages/cli/assets` contains the
  built canvas plus a standalone report template.
- `--report` writes a self-contained `routogram-report.html` when the daemon session ends.
- The daemon and canvas are separate servers (`4040`/`6060`) with automatic free-port fallback;
  the canvas receives a `window.__ROUTOGRAM_DAEMON_URL__` bootstrap when served from `:6060`.
- `.github/workflows/release-napi.yml` builds macOS x64/arm64, Linux x64/arm64 glibc/musl,
  Windows x64, and `wasm32-wasip1`. The generated NAPI loader uses the WASI package fallback
  when a native `.node` binary is unavailable.
- `crates/routogram-core` is publishable to crates.io; `routogram` and `@routogram/client` are
  the npm-facing packages.

## Phase 5 capabilities

### Monorepo topology

- `crates/routogram-core/src/workspace/mod.rs` discovers packages from
  `pnpm-workspace.yaml`, `package.json` workspaces, `turbo.json`, and Nx `project.json`
  projects.
- `tsconfig.json`/`jsconfig.json` `baseUrl` + `paths`, workspace package names, and
  `node_modules` symlinks are resolved for imports.
- Component/stylesheet dependencies that cross package boundaries become dashed
  `cross_package` edges with `fromPackage` / `toPackage` metadata.
- Every node carries its `package`; topology includes a `workspace` descriptor with package
  names, paths, and detected frameworks.
- The canvas header exposes independent **Framework** and **Package** filters that recompute
  the macro graph without a page reload.

### Framework route extractors

- **Astro**: `src/pages/**/*.astro`, dynamic routes, and `client:load` / `client:visible` /
  `client:idle` islands. Islands become explicit `island` nodes connected by hydration edges.
- **Nuxt/Vue**: `pages/**/*.vue`, nested layout files, middleware files, `definePageMeta`
  middleware references, and Vue Router config `path` entries.
- **SvelteKit**: `src/routes/+page.svelte` and `+layout.svelte` route trees.
- **TanStack Router**: route calls are read from the oxc AST (`createFileRoute`,
  `createRoute`, `createRootRoute`) rather than inferred from filenames.
- Next.js App/Pages routing remains supported. Other routers fall back to entry components.

### IDE deep-linking

- `POST /api/ide/open` accepts `{ filePath, line, column, editor? }` and auto-detects or uses
  `ROUTOGRAM_EDITOR`. Supported schemes: `vscode`, `cursor`, `vscode-insiders`, `zed`,
  `webstorm`, and `intellij`.
- `POST /api/ide/focus` accepts `{ filePath }`, resolves matching topology nodes, and broadcasts
  `FOCUS_NODE` over `/ws`. The canvas clears scope filters, expands macro roots, highlights the
  node, zooms to it, and opens the Inspector.
- Set `ROUTOGRAM_FOCUS_ON_CHANGE=1` to emit the same focus event from the file watcher for a
  lightweight editor-follow workflow.

### Config, plugins, and lint

Create a local `routogram.config.ts` (or `.js`/`.mjs`/`.cjs`):

```ts
import type { RoutogramConfig } from "@routogram/types";

const config: RoutogramConfig = {
  framework: "auto",
  ignorePatterns: ["**/*.test.tsx", "**/*.stories.tsx"],
  plugins: [
    {
      name: "internal-rules",
      rules: [
        {
          meta: { id: "no-private-imports" },
          run({ report }) {
            report({ message: "Company rule violation.", file: "src/legacy.ts" });
          },
        },
      ],
      extractors: [
        {
          name: "topology-notes",
          extract(topology) {
            return topology;
          },
        },
      ],
    },
  ],
  rules: {
    "max-component-depth": [2, { max: 5 }],
    "no-orphan-components": 1,
    "enforce-token-prefix": [2, { prefix: "--zl-" }],
    "no-private-imports": 2,
  },
};

export default config;
```

`routogram lint` loads the config with `jiti`, applies ignore patterns and plugin extractors,
runs the selected built-in/custom rules, and exits `1` when any error is reported:

```bash
pnpm routogram lint
pnpm routogram lint --config routogram.config.ts --json
```

Built-in rules: `max-component-depth`, `no-orphan-components`, and
`enforce-token-prefix`. Plugin extractors run on the canonical topology and may enrich it; the
Rust AST remains the source of truth for scanned source files.

## Phase 4 capabilities

- ELK layered layout runs inside `packages/canvas/src/app/features/topology/workers/elk.worker.ts`; the hook in
  `features/topology/hooks/use-elk-layout.ts` only posts graph data and applies the returned coordinates, keeping the
  React Flow main thread responsive.
- Macro view renders Next.js App Router `page`/`layout` nodes and Pages Router pages; expand a
  route or layout with its `+N` control (or double-click) to lay out its component subtree.
- LOD hides type labels, expand counters, ports, and edge labels below zoom `0.4`, hides
  secondary details below `0.7`, and restores the full view at `0.7` and above.
- `IncrementalScanner` in Rust caches CSS, JSX, and boundary analyses by file fingerprint
  (mtime + size). A watcher event reparses only changed files, reassembles the graph, and
  emits a node/edge/token delta instead of a full snapshot.
- The daemon broadcasts `PATCH_TOPOLOGY`; the canvas merges the delta in place without
  resetting React Flow pan, zoom, or the current viewport.
- Route/layout nodes are added for Next.js App Router and Pages Router projects. Other routers
  fall back to entry components (components with no incoming `renders` edge) as macro roots.
- The CLI bundles the Vite canvas into `assets/` and serves the production UI on `:6060`.

## Phase 3 capabilities

- LightningCSS parses vanilla CSS and CSS Modules, including `:root`, `:host`, and `@theme`
  custom-property declarations.
- The JSX analyzer extracts `className`, `styles.foo`, `styles["foo"]`, template-literal
  classes, inline custom properties, and `var(--token)` references.
- Every component node carries `meta.styleMetrics`: consumed tokens, defined class count, dead CSS,
  unresolved tokens, and specificity blast-radius warnings.
- `styles_with` edges connect components to imported stylesheets and to stylesheets that define
  the tokens they consume.
- The Inspector slides in from the right when a node is selected and includes Page/Component/RSC/
  Client badges, design-token pills, and a CSS health audit.
- The Inspector exposes Overview, Tokens, and CSS Health tabs, plus an Open in Editor action
  routed through `/api/ide/open`.
- The CLI keeps a full-rescan fallback when incremental patches are unavailable.
- Next.js App Router `route.ts` and Pages Router `pages/api/*` handlers become boundary nodes.
- File-level and inline `"use server"` actions become `server_action` nodes.
- `fetch`, `axios`, Hono RPC, tRPC, and Elysia Eden call-sites produce component `networkCalls`
  metadata plus dashed `calls_api` / `invokes_action` edges when a matching boundary exists.
- Component imports produce `renders` edges, giving the AI real hierarchy evidence for
  prop-drilling analysis.
- The BYOK Copilot provides an architecture audit and semantic queries that highlight node IDs
  directly in React Flow, dimming everything else to 20% opacity.
- `--static` emits a single portable HTML file with the topology embedded.

### Known limits

- Static analysis covers `.css`, `.tsx`, `.jsx`, `.astro`, `.vue`, `.svelte`, and route config
  files; preprocessors and arbitrary custom module aliases are not resolved.
- Dead CSS is reported per component for `.module.css` imports; dynamic class construction can
  still produce false positives.
- The scanner emits one component node per JSX/TSX file, so sibling component declarations share
  that file-level style metric set.
- Route method extraction covers direct `export function GET` and `export const GET` forms;
  re-exported handlers are not resolved yet.
- Server-action call matching is name-based, so aliased or identically named actions can be
  ambiguous.
- AI analysis is only as good as the topology evidence and the selected model; the server
  validates structure and node IDs but does not execute provider-side tooling.
- Route/layout macro grouping recognizes Next.js, Astro, Nuxt/Vue, SvelteKit, and TanStack
  conventions; other routers fall back to entry components.
- Incremental invalidation uses file mtime + size rather than a content hash.
- ELK is bundled in a dedicated worker (~1.4 MB raw); this is intentionally isolated from the
  main canvas bundle.
- Plugin extractors run on topology JSON in the CLI, not inside the Rust AST pipeline; native
  extractors remain a Rust extension point.
- Nuxt middleware discovery uses `middleware/**` files and `definePageMeta` names; complex
  programmatic middleware chains are not evaluated.
- Graph RAG uses deterministic local feature hashing, not an ML embedding provider; replace the
  embedding adapter if semantic recall needs a hosted model.
- AQL is a bounded declarative subset; path traversal is capped at four hops and
  `NOT EXISTS` is evaluated across the index.
- Multiplayer presence uses a custom WebSocket room, not full Yjs CRDT document sync.
- Simulation is intentionally in-memory only; applying migration recipes is a separate,
  explicit daemon operation.
- Router migration is a topology projection, not a codemod. It flags routes needing manual file
  moves rather than rewriting router source.
- Drift self-healing is an explicit revert action; automatic source rewriting is deliberately
  not enabled for critical drift.
- Federation config parsing is intentionally heuristic; complex dynamic remote maps should be
  normalized into a static `remotes` declaration.
- The agent ships a deterministic planner/tool loop; it uses the same safe preview/approval
  path as a hosted LLM planner. A model adapter can replace the planner without changing tools.
- LSP code actions emit a preview command; the target editor must map that command or use the
  Routogram Canvas for approval.
- Auto-Fix extraction targets the first top-level JSX return; nested-subtree selection and
  precise prop types are intentionally conservative. Generated props use `any` and need review.
- Dead CSS pruning handles simple top-level class rules; rules inside `@media`/other at-rules are
  left untouched.
- Git timeline uses first-parent history only; merge-branch side histories are not shown.
- Runtime Fiber metrics depend on React exposing debug sources in development; production
  builds intentionally do not load `@routogram/client`.
- The WASI fallback does not include Git history because `git2`/libgit2 are native-only.
- NAPI-RS generates `crates/routogram-core/index.js` and `index.d.ts`; both are committed and
  excluded from Biome because they are build artifacts. `packages/cli/assets` is generated by
  `pnpm build` and is gitignored.

## License

Apache-2.0. See [LICENSE](./LICENSE).
