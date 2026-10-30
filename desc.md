# Routogram — Repository Guide for AI Agents

> Tài liệu này mô tả cấu trúc, kiến trúc, luồng dữ liệu, quy ước và các điểm cần bảo toàn khi chỉnh sửa repo Routogram.
> Khi có mâu thuẫn, **mã nguồn và schema trong `packages/types` là nguồn sự thật cuối cùng**.

---

## 1. Routogram là gì?

Routogram là công cụ phân tích kiến trúc codebase frontend/fullstack và trực quan hóa nó thành một đồ thị tương tác.

Nó có thể:

- Quét route, layout, component, hook, stylesheet, design token và API boundary.
- Dựng topology có hướng giữa các node.
- Phân tích code health (lint/diagnostics) trên từng file.
- Phân tích style, token, network calls, data flow, props và state stores.
- Hiển thị topology trên canvas React Flow.
- Hỗ trợ inspector, highlight tuyến phụ thuộc, store highlight, runtime telemetry.
- So sánh kiến trúc giữa các git ref, kiểm tra rulebook trong CI.
- Hỗ trợ AI copilot/agent, simulation, migration, refactor, Graph RAG và federated multi-repo.
- Xuất static report một file HTML.

Repo hiện ở trạng thái **Phase 10** theo README, nhưng nhiều tính năng là thử nghiệm. Ưu tiên giữ ổn định các luồng scan → daemon → canvas → inspector.

---

## 2. Kiến trúc tổng quan

```text
┌───────────────────────────────────────┐
│ crates/routogram-core                 │
│ Rust + oxc_parser + LightningCSS      │
│ AST, route, style, graph, git, LSP    │
│ scan_workspace() → topology JSON      │
└──────────────────┬────────────────────┘
                   │ NAPI-RS bridge
┌──────────────────▼────────────────────┐
│ packages/cli                          │
│ Hono daemon mặc định :4040            │
│ HTTP API + WebSocket + watcher        │
│ health / git / AI / simulation / LSP  │
└──────────────────┬────────────────────┘
                   │ /api/* + /ws
┌──────────────────▼────────────────────┐
│ packages/canvas                       │
│ React 19 + Vite + Tailwind + React Flow│
│ canvas :6060, inspector, store panel  │
└──────────────────┬────────────────────┘
                   │ shared contracts
┌──────────────────▼────────────────────┐
│ packages/types                        │
│ topology schema + guards + config     │
└───────────────────────────────────────┘
```

Luồng chính:

1. CLI gọi native core qua NAPI để quét workspace.
2. Native core trả về topology JSON đã chuẩn hóa.
3. CLI lưu snapshot, phục vụ qua `/api/topology` và watcher.
4. Canvas fetch topology, dựng view, layout bằng ELK và render React Flow.
5. Canvas gọi thêm health, runtime, git, AI, simulation, federation... khi cần.

---

## 3. Cấu trúc monorepo

```text
routogram/
├── crates/
│   └── routogram-core/          # Rust static-analysis engine + NAPI + LSP
├── packages/
│   ├── types/                   # Shared TypeScript topology contracts
│   ├── cli/                     # CLI, Hono daemon, static export, static assets
│   ├── canvas/                  # React Flow visualization client
│   ├── client/                  # Runtime telemetry bridge (React/network)
│   ├── cloud-sync/              # Snapshot packaging/upload
│   ├── plugin-core/             # Diagnostics engine + shared plugin types
│   ├── plugin-react/            # React code-health rules
│   ├── plugin-next/             # Next.js/CSS code-health rules
│   ├── plugin-vue/              # Vue code-health rules
│   └── vscode-extension/        # VS Code / Cursor extension
├── examples/
│   └── next-pc-ecommerce/       # Next.js example app used for dogfooding
├── scripts/
│   ├── build-report-template.mjs
│   ├── clean.mjs
│   ├── copy-canvas.mjs
│   └── copy-lsp.mjs
├── .github/workflows/           # NAPI release + architecture gate
├── README.md                    # Product/features documentation
├── desc.md                      # This agent-oriented guide
├── Cargo.toml                   # Rust workspace
├── package.json                 # Root scripts/toolchain
├── pnpm-workspace.yaml          # pnpm workspace
└── biome.json                   # Lint/format rules
```

Hai package graph độc lập:

- **pnpm** quản lý `packages/*` và `examples/next-pc-ecommerce`.
- **Cargo** quản lý `crates/*`.
- Native addon được build từ Cargo và load bởi CLI.

---

## 4. Rust core (`crates/routogram-core`)

Đây là bộ não phân tích tĩnh. Viết bằng Rust, dùng `oxc_parser` cho JS/TS/JSX và LightningCSS cho CSS.

### 4.1 Module chính

| File / module              | Trách nhiệm                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib.rs`               | NAPI exports, `NativeCore`, scan/build/simulate/refactor/migration/Graph RAG        |
| `src/model.rs`             | Serialized model: `Node`, `Edge`, `NodeMeta`, `Topology`, `StyleToken`...           |
| `src/workspace/mod.rs`     | Workspace/package detection, path aliases, import resolution, file walking          |
| `src/analyzer/mod.rs`      | Scan orchestration, framework detection, nodes/edges assembly, data-flow attachment |
| `src/analyzer/matcher.rs`  | JSX/AST analysis: classes, tokens, network calls, props, providers, stores          |
| `src/analyzer/routes.rs`   | Next route/layout graph assembly                                                    |
| `src/analyzer/network.rs`  | Server actions/API boundary analysis                                                |
| `src/analyzer/cache.rs`    | File-fingerprint caching                                                            |
| `src/routing/*.rs`         | Vue, Nuxt, Astro, SvelteKit, TanStack route extraction                              |
| `src/style/mod.rs`         | CSS parsing, token registry, style metrics, blast radius                            |
| `src/git/mod.rs`           | Git timeline/topology diffs                                                         |
| `src/graph_rag/mod.rs`     | Graph index, semantic-ish search, AQL                                               |
| `src/simulation/mod.rs`    | Shadow graph mutation/simulation                                                    |
| `src/migration/mod.rs`     | Migration recipes                                                                   |
| `src/refactor/mod.rs`      | AST refactor recipes                                                                |
| `src/rulebook/mod.rs`      | Architecture rulebook / SARIF-ready checks                                          |
| `src/federation/mod.rs`    | Multi-root topology federation                                                      |
| `src/lsp/mod.rs`           | LSP server/gateway                                                                  |
| `src/bin/routogram-lsp.rs` | LSP binary entrypoint                                                               |

### 4.2 Quét file

- Walker bỏ qua: `.git`, `.next`, `.turbo`, `.vite`, `coverage`, `dist`, `routogram-report`, `node_modules`, `target`.
- Bỏ qua `*.d.ts`, file test/spec và `__tests__`/`__mocks__`.
- Hỗ trợ `.tsx`, `.jsx`, `.ts`, `.js`, `.mts`, `.cts`, `.mjs`, `.cjs`, `.vue`, `.svelte`, `.astro`, CSS.
- Có giới hạn kích thước file (`MAX_SOURCE_BYTES = 2 MB`).

### 4.3 Framework detection

Workspace phát hiện framework qua dependency/package và file patterns. Các framework được hỗ trợ gồm:

- Next.js (App Router / Pages Router)
- React
- Vue / Nuxt
- Astro
- SvelteKit
- TanStack Router
- Lit / Solid / Preact ở mức component analysis

Runtime component:

- `server`
- `client`
- `universal` — **không dùng `shared`**

### 4.4 Metadata node được trích xuất

`RoutogramNode.meta` có thể chứa:

```ts
{
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
```

Chi tiết:

- `styleMetrics`: token tiêu thụ, class định nghĩa, class chưa dùng, token lạ, blast radius, stylesheet.
- `networkCalls`: endpoint + method + loại `rpc | fetch | action`.
- `dataFlow`:

  ```ts
  {
    providers: string[];          // QueryClientProvider, ThemeContext.Provider...
    dataRole: "fetcher" | "passive";
    fetchSignals: string[];       // fetch, useQuery, useSWR, axios, prisma...
    reRenderSurfaceCount: number; // số component downstream
  }
  ```
- `props`:

  ```ts
  { name: string; type?: string; optional: boolean }[]
  ```

  Hỗ trợ:
  - function/arrow component,
  - destructured inline type,
  - local interface/type alias,
  - intersection type,
  - function props như `(id: string) => void`.
- `usedStores`: chỉ custom hooks hợp lệ theo regex `^use[A-Z]\w*Store$`.
  - Blacklist: `useStore`, `create`, `createStore`, `Store`.
  - Không nhận type/enum/interface như `ModelOption`, `EffortLevel`.
  - Không nhận `*Context` trong `usedStores` (context vẫn nằm trong `dataFlow.providers`).
  - Import từ store path chỉ được nhận nếu tên hợp lệ.

### 4.5 Graph model

Node layers:

| Layer      | Kinds                                                       |
| ---------- | ----------------------------------------------------------- |
| `macro`    | `route`, `layout`                                           |
| `meso`     | `component`, `hook`, `island`                               |
| `micro`    | `style`, `token`                                            |
| `boundary` | `api_endpoint`, `api_client`, `server_action`, `middleware` |

Edge kinds:

```text
routes_to
renders
dynamic_imports
calls_api
invokes_action
styles_with
cross_package
```

Topology schema version hiện tại: **2**.

---

## 5. Shared contracts (`packages/types`)

File chính: `packages/types/src/index.ts`.

Chứa:

- Schema version và generator version.
- Layer metadata/màu sắc.
- Node kinds theo layer.
- Runtime directives.
- Edge kinds/metadata.
- Node/edge/topology interfaces.
- Patch/runtime/timeline/diff/focus contracts.
- Type guards: `isRoutogramTopology`, `isRoutogramTopologyPatch`, `isRoutogramRuntimeSnapshot`...
- `applyTopologyPatch`.
- Config types: `RoutogramConfig`, `AiConfig`, `AiProviderConfig`.
- Plugin/lint types.

Quy tắc:

- Không sửa schema tùy tiện; nếu đổi shape phải cập nhật:
  1. Rust model,
  2. TypeScript types,
  3. CLI/canvas consumers,
  4. static export/report nếu liên quan.
- Ưu tiên nested `node.meta.*`; `node.styleMetrics` là legacy fallback.

---

## 6. CLI + daemon (`packages/cli`)

Package name: `routogram`.

### 6.1 Thành phần

| File                      | Trách nhiệm                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `src/index.ts`            | Entrypoint, arg parsing, scan loop, HTTP/WS server, static canvas  |
| `src/native.ts`           | Load NAPI addon, fallback native errors                            |
| `src/config.ts`           | Load `.routogramrc.json` / `routogram.config.*`, env interpolation |
| `src/health.ts`           | Code health cho từng node                                          |
| `src/lint.ts`             | Architecture lint + summary                                        |
| `src/rulebook.ts`         | Rulebook checks, markdown/SARIF output                             |
| `src/diff.ts`             | Git topology diff                                                  |
| `src/architecture-doc.ts` | Markdown architecture digest                                       |
| `src/static-export.ts`    | Static single-file report                                          |
| `src/annotations.ts`      | Repo-backed annotations                                            |
| `src/editors.ts`          | IDE URI resolution                                                 |
| `src/agent/mod.ts`        | Autonomous agent mission manager                                   |
| `src/watcher/drift.ts`    | File watcher drift detection/healing                               |
| `src/routes/*.ts`         | Hono route modules                                                 |
| `bin/routogram.js`        | Published CLI bin                                                  |

### 6.2 Chạy daemon

```bash
pnpm routogram
# tương đương:
node packages/cli/bin/routogram.js
```

Mặc định:

- Daemon: `http://127.0.0.1:4040`
- Canvas: `http://127.0.0.1:6060`
- Nếu port bận, CLI tự chọn port kế tiếp — **luôn kiểm tra log URL thực tế**.

Flags quan trọng:

```text
--root <path>
--port <port>
--canvas-port <port>
--no-open
--no-watch
--no-canvas
--static --out <dir>
--report
```

Subcommands:

```text
routogram
routogram diff
routogram lint
routogram test-arch
routogram graph
routogram publish
routogram snapshot
routogram report
routogram lsp
```

### 6.3 API chính

| Endpoint                                       | Mô tả                               |
| ---------------------------------------------- | ----------------------------------- |
| `GET /api/health`                              | Daemon/watcher/native status        |
| `GET /api/topology`                            | Topology hiện tại                   |
| `GET /api/health/code`                         | Diagnostics/health theo node        |
| `GET /api/runtime`                             | Runtime telemetry                   |
| `GET /api/git/timeline`                        | Git timeline/diff                   |
| `GET /api/config`                              | Config đã normalize                 |
| `GET /api/config/ai`                           | AI providers khả dụng               |
| `GET/POST/PATCH/DELETE /api/annotations`       | Annotations/ADR                     |
| `POST /api/ide/open`                           | Mở file trong editor                |
| `POST /api/ide/focus`                          | Focus node từ IDE                   |
| `POST /api/ai/audit`, `/query`, `/chat`        | AI Copilot                          |
| `POST /api/graph/index`, `/search`, `/context` | Graph RAG/AQL                       |
| `GET/POST /api/simulation/*`                   | Shadow simulation                   |
| `POST /api/migration/scan`, `/apply`           | Migration sandbox                   |
| `POST /api/refactor/apply`                     | AST refactor                        |
| `GET/POST /api/drift/*`                        | Drift heal                          |
| `/api/agent/missions`                          | Agent missions                      |
| `/api/federation`                              | Federated topology                  |
| `/api/drift`                                   | Drift endpoints                     |
| `WS /ws`                                       | Snapshot/patch/focus/runtime events |
| `WS /ws/runtime`                               | Browser telemetry ingress           |
| `WS /ws/collab`                                | Multiplayer cursor/presence         |
| `WS /ws/agent`                                 | Agent mission updates               |

### 6.4 Static export

```bash
pnpm build
node packages/cli/dist/index.js --static --out ./routogram-report
```

Kết quả:

- `routogram-report/index.html` — JS/CSS/data inline, chạy được qua `file://`.
- `routogram-report/topology.json` — snapshot cho CI.

Static mode là read-only; editor/AI/path daemon-backed bị tắt.

---

## 7. Canvas (`packages/canvas`)

Stack:

- React 19
- Vite
- Tailwind CSS v4
- `@xyflow/react` (React Flow 12)
- ELK layout (`elkjs`)
- Zustand
- Lucide icons

### 7.1 Cấu trúc quan trọng

```text
src/app/features/topology/
├── shell.tsx                      # Composition, data, selectedId, stores
├── components/
│   ├── topology-canvas/           # React Flow, nodes, edges, highlight
│   ├── topology-toolbar/          # Count badge + filter chip
│   ├── stores-panel/              # State Stores panel
│   ├── inspector-drawer/          # Inspector side panel
│   ├── federated-switcher/
│   ├── runtime-overlay/
│   ├── drift-banner/
│   ├── diff-modal/
│   ├── collaboration-status/
│   └── collaborator-cursors/
├── hooks/
│   ├── use-topology.ts            # fetch topology/health, websocket
│   ├── use-elk-layout.ts          # ELK layout
│   └── use-collaboration.ts
├── workers/elk.worker.ts
└── types/topology.ts
```

Các file hỗ trợ:

- `src/components/nodes/routogram-flow-node.tsx` — custom node handles/toggle.
- `src/lib/utils/topology-view.ts` — root detection + expand/collapse tree.
- `src/lib/utils/format-name.ts` — `PascalCase → Title Case`.
- `src/lib/apis/*` — daemon clients.
- `src/stores/*` — AI settings, simulation, agent Zustand stores.
- `src/styles/global.css` — React Flow/node/edge overrides.

### 7.2 Topology view

`buildTopologyView`:

- Root là macro node không có incoming `routes_to`.
- Fallback component roots nếu không có macro root.
- Chỉ hiện node thuộc root đã expand.
- `childCounts` đếm child theo loại:
  - component → component children,
  - macro → layout/route children.
- Edge bị ẩn nếu source collapsed.
- `expandedNodeIds` suy ra từ visible edges.

Mặc định canvas mở fully expanded.

### 7.3 React Flow behavior / invariants

**Không được làm hỏng các hành vi sau:**

1. **Node geometry ổn định**
   - Hover/selection không được scale node.
   - `NODE_WIDTH`, `NODE_HEIGHT` cố định.
   - Handle và toggle phải giữ đúng vị trí.

2. **Hover highlight**
   - Hover target: opacity 1, border/glow theo health, `z-index: 30`.
   - Ancestor: opacity 1, glow nhẹ, `z-index: 20`.
   - Off-path: opacity 0.2.
   - Edge off-path: opacity 0.15.
   - Hover dùng CSS class imperative (`routogram-hover-*`), **không rebuild node arrays mỗi lần hover**.
   - Mouse leave có debounce 50ms.

3. **Selected/Inspector lock**
   - Khi Inspector mở (`selectedNodeId !== null`), hover bị khóa; tuyến selected giữ cố định.
   - Click node khác vẫn đổi selected.
   - Không còn hover preview khi selected.
   - Đóng Inspector → hover tự do trở lại.

4. **Node background**
   - Luôn solid, không alpha/gradient/backdrop:
     - normal: `#0e0e12`
     - danger: `#151014`
     - ghost: `#161014`
   - Node có `z-index: 10`; selected target `30`; ancestor `20`.
   - Background solid để edge/grid không xuyên qua thân node.

5. **Stores**
   - Panel `State Stores` dọc ở top-left canvas.
   - Chỉ hiện custom store hợp lệ `use[A-Z]…Store`.
   - Hover store:
     - node match: opacity 1, indigo ring/glow, z30;
     - node off: opacity 0.2, `pointer-events: none`;
     - edge không kết nối 2 node match: opacity 0.15.
   - Mouse leave clear toàn bộ store classes.
   - Store panel collapse/expand độc lập.

6. **Inspector**
   - Panel nằm `absolute` bên phải **trong diagram container**, không phủ Header/Sidebar.
   - Backdrop `absolute inset-0 z-20` chỉ trong diagram.
   - Click backdrop đóng Inspector.
   - Panel `z-40`, rộng 420px.
   - Header title format PascalCase thành các từ có khoảng trắng.
   - File path giữ nguyên.
   - Nội dung hiện tại theo thứ tự:
     1. INFO (data flow: Props-driven/Self-fetching, providers, re-render scope)
     2. PROPS (name, type, optional `?`)
     3. DIAGNOSTICS

7. **Node label**
   - Dùng `formatComponentName`:
     - `StorefrontHomePage` → `Storefront Home Page`
     - `HeroBannerTemplate` → `Hero Banner Template`
   - Tooltip/title giữ raw name.

8. **Edges**
   - `onlyRenderVisibleElements={false}`.
   - `minZoom=0.05`, `maxZoom=2`.
   - Non-scaling stroke.
   - Hover path cyan `#22d3ee`, width 2.
   - Không được để edge đè lên node solid.

### 7.4 Canvas layout

- Top bar + sidebar nằm ngoài diagram.
- Diagram top-left stack:
  - count badge `nodes | edges` nằm trong **toolbar ngang**.
  - StoresPanel absolute, cùng left edge với badge, top offset nhỏ để nằm sát dưới badge.
- Inspector backdrop và panel nằm trong wrapper `relative overflow-hidden` của diagram.
- Header/Sidebar/Topbar phải luôn tương tác được khi Inspector mở.

---

## 8. Code Health Engine

Nằm ở:

- `packages/plugin-core`
- `packages/plugin-react`
- `packages/plugin-next`
- `packages/plugin-vue`
- CLI `src/health.ts`

### Rules hiện có

| Rule                              | Ý nghĩa                                   |
| --------------------------------- | ----------------------------------------- |
| `react/no-uncleaned-effects`      | Effect thiếu cleanup                      |
| `next/enforce-component-contract` | Component contract của Next               |
| `next/no-console-in-server`       | Console trong server component            |
| `css/enforce-tokens`              | Hardcoded color, khuyến nghị design token |
| `vue/no-uncleaned-watch`          | Watch thiếu cleanup                       |

### Health levels

```text
safe < tidy < warning < danger
```

`resolveNodeHealth([])` → `safe`.

### Stylesheet behavior

- Bỏ qua diagnostics cho:
  - `.css`, `.scss`, `.sass`, `.less`, `.pcss`
  - node kind `style`
- Node stylesheet luôn `safe`, 0 diagnostics.
- Inspector hiển thị:
  `No issues detected for stylesheet.`

Code health endpoint:

```text
GET /api/health/code
{
  generatedAt,
  nodes: {
    [nodeId]: { health, diagnostics: Diagnostic[] }
  }
}
```

---

## 9. Example app (`examples/next-pc-ecommerce`)

Đây là app Next.js dùng để dogfood scanner/UI.

- Next.js App Router, `src/` root.
- i18n `next-intl`, route `[locale]`.
- Tailwind v4.
- Base UI, GraphQL Yoga.
- Zustand cart UI store:
  - `src/stores/cart-ui-store.ts`
  - `useCartUiStore`
- Config: `.routogramrc.json`:
  - aliases `@/* → src/*`
  - token prefix `--zl-`
  - AI provider DeepSeek.
- Có static report trong `routogram-report/`.

Cấu trúc route groups:

```text
src/app/[locale]/
├── (console)/        # dashboard + products
├── (entry)/          # login/signup
├── (landing)/        # landing, black friday
├── (site)/           # storefront, products
├── _shared/          # cart/locale switchers
└── layout.tsx
```

Component convention:

```text
_components/<feature>/
├── client.tsx
├── server.tsx
├── template.tsx
└── skeleton.tsx
```

Khi test UI/scan thường dùng app này làm root.

---

## 10. Các package phụ

### `packages/client`

Runtime telemetry bridge:

- React fiber/render tracking.
- Network instrumentation.
- Transport to daemon `/ws/runtime`.
- Chỉ dùng development.

### `packages/cloud-sync`

- Tạo snapshot kiểu `ArchitectureSnapshot`.
- Đóng gói anonymized topology.
- Upload hub/presigned/local.
- Không chứa logic scan.

### `packages/vscode-extension`

- Webview topology.
- CodeLens, commands.
- Gọi daemon `:4040`, mở canvas `:6060`.
- Cache topology ngắn hạn.

### Plugins

- `plugin-core`: shared plugin contract, TS parser, health resolution, extension gate.
- `plugin-react`, `plugin-next`, `plugin-vue`: framework rules.
- Được build trước CLI/canvas vì canvas typecheck phụ thuộc `plugin-core`.

---

## 11. Config

Thứ tự tìm config:

```text
.routogramrc.json
routogram.config.ts
routogram.config.mts
routogram.config.js
routogram.config.mjs
routogram.config.cjs
```

Các field chính:

```ts
{
  framework?: "auto" | "next" | "astro" | "vue" | "nuxt" | "sveltekit" | "tanstack" | "react";
  routerType?: "app" | "pages";
  root?: string;
  aliases?: Record<string, string>;
  tokens?: { prefix?: string };
  maxDepth?: number;
  editor?: { default?: "cursor" | "vscode" };
  ai?: { default?: string; providers?: AiProviderConfig[] };
  ignorePatterns?: string[];
  plugins?: RoutogramPlugin[];
  rules?: Record<string, RoutogramRuleSetting>;
}
```

- JSON config hỗ trợ `${ENV_VAR}`.
- TS config load qua `jiti`.
- Schema: `packages/cli/configuration_schema.json`.

---

## 12. Build, typecheck và test

### Prerequisites

```text
Node >= 22.13
pnpm >= 12.14
Rust >= 1.97
```

### Cài đặt

```bash
pnpm install
```

`postinstall` build types, cloud-sync và plugins.

### Commands

| Command                    | Ý nghĩa                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                 | Build types/native debug/cloud/client + chạy CLI & canvas dev |
| `pnpm dev:cli`             | Chạy CLI dev                                                  |
| `pnpm dev:canvas`          | Chạy canvas Vite                                              |
| `pnpm build`               | Full pipeline                                                 |
| `pnpm build:native`        | NAPI release                                                  |
| `pnpm build:native:debug`  | NAPI debug                                                    |
| `pnpm build:types`         | `@routogram/types`                                            |
| `pnpm build:plugins`       | plugin-core/react/next/vue                                    |
| `pnpm build:cloud`         | cloud-sync                                                    |
| `pnpm build:client`        | runtime client                                                |
| `pnpm build:cli`           | CLI TS + schema                                               |
| `pnpm build:canvas`        | Canvas + copy assets                                          |
| `pnpm build:canvas-bundle` | Chỉ copy canvas dist                                          |
| `pnpm build:extension`     | VS Code extension                                             |
| `pnpm build:lsp`           | Rust LSP + copy                                               |
| `pnpm build:core`          | Cargo release workspace                                       |
| `pnpm typecheck`           | Build types/cloud/plugins + tsc packages                      |
| `pnpm test`                | Rust lib tests                                                |
| `pnpm lint`                | Biome toàn repo                                               |
| `pnpm lint:fix`            | Biome write                                                   |
| `pnpm verify`              | lint + typecheck + build                                      |
| `pnpm routogram`           | Chạy packaged CLI                                             |
| `pnpm clean`               | Xóa build/deps artifacts                                      |

### Build order

```text
native → types → cloud → plugins → client → cli
→ extension → canvas → report template → lsp
```

Không đảo thứ tự types/plugins trước CLI/canvas.

---

## 13. Ma trận rebuild khi sửa code

| Vùng sửa                     | Cần build/restart                               |
| ---------------------------- | ----------------------------------------------- |
| `crates/routogram-core`      | `pnpm build:native`, restart daemon             |
| `packages/types`             | `pnpm build:types`, typecheck/build consumers   |
| `packages/plugin-*`          | `pnpm build:plugins`, CLI/canvas typecheck      |
| `packages/cli`               | `pnpm --filter routogram build`, restart daemon |
| `packages/canvas`            | `pnpm build:canvas` (hoặc dev Vite), refresh    |
| `examples/next-pc-ecommerce` | Restart daemon/scan; dùng `--no-watch` khi QA   |
| static report                | `pnpm build` + static export command            |

### Quy tắc QA bundle

- `pnpm --filter @routogram/canvas build` **không tự copy** vào CLI.
- Luôn chạy:

  ```bash
  pnpm --filter @routogram/canvas build
  node scripts/copy-canvas.mjs
  ```
- **Restart daemon sau copy**; daemon cache `index.html` cũ có thể trỏ tới asset hash đã bị xóa, khiến trang trắng.
- Nếu port bận, CLI đổi port (4040 → 4041, 6060 → 6061). Kiểm tra log.

---

## 14. QA checklist

Trước khi kết thúc thay đổi UI/scan:

```bash
pnpm exec biome check packages
pnpm --filter @routogram/canvas typecheck
pnpm --filter @routogram/canvas build
node scripts/copy-canvas.mjs
cargo test -p routogram-core
```

Nếu sửa schema/native:

```bash
pnpm build:native
pnpm --filter routogram typecheck
pnpm --filter routogram build
```

Nếu sửa example:

```bash
pnpm --filter next-pc-ecommerce typecheck
pnpm --filter next-pc-ecommerce build
```

### QA ports

Dọn process cũ trước khi chạy:

```bash
for p in 4040 4041 6060 6061 9222 3000; do
  lsof -tiTCP:$p -sTCP:LISTEN | xargs -r kill
done
```

Sau QA phải trả các port về free.

### Browser QA

- Dùng Chrome headless/CDP khi cần.
- Kiểm tra:
  - console errors,
  - topology load,
  - selected highlight,
  - Inspector backdrop chỉ trong diagram,
  - StoresPanel hover,
  - node labels,
  - node/edge opacity.

---

## 15. Coding conventions

- TypeScript strict; ESM; `.js` extension trong import nội bộ package khi cần.
- React 19, function components, hooks.
- Tailwind v4; dùng `cn()` cho conditional classes.
- Biome: 2 spaces, double quotes, organized imports.
- Không dùng `any` nếu có thể; example từng có lỗi implicit-any.
- Comment code khi logic không hiển nhiên; ưu tiên tiếng Anh trong code, tiếng Việt trong tài liệu.
- Không thêm dependency nếu có thể dùng sẵn.
- Với React Flow:
  - Tránh rebuild node/edge arrays cho hover.
  - Ưu tiên imperative class toggle cho hiệu ứng tần suất cao.
  - Giữ node geometry và viewport ổn định.
  - CSS override cần `!important` có chủ đích; file global đã có suppression comment.

---

## 16. Common tasks

### Thêm một rule code health

1. Thêm rule trong plugin phù hợp.
2. Export vào plugin array.
3. Build plugin.
4. `packages/cli/src/health.ts` tự chọn plugin theo extension.
5. Test rule trên fixture.

### Thêm metadata node

1. Thêm field vào Rust `NodeMeta`.
2. Thêm field tương ứng vào `RoutogramNodeMeta` (`packages/types`).
3. Gán metadata trong analyzer.
4. Build native.
5. Thêm UI hiển thị/tiêu thụ.
6. Build types/canvas.

### Thêm store detection

- Chỉ chấp nhận hook `use[A-Z]…Store`.
- Không nhận type/enum/interface.
- Import store path chỉ là tín hiệu phụ, không thay thế naming rule.
- Cập nhật cả AST matcher và test fixture.

### Thêm API route

1. Tạo route trong `packages/cli/src/routes/`.
2. Mount trong `packages/cli/src/index.ts`.
3. Thêm endpoint vào `packages/canvas/src/lib/constants/api.ts` nếu canvas dùng.
4. Type client trong `src/lib/apis`.
5. Cập nhật README/desc nếu public.

### Sửa Inspector

- Giữ panel absolute trong diagram.
- Backdrop chỉ diagram.
- Header/Sidebar vẫn tương tác.
- Thứ tự: INFO → PROPS → DIAGNOSTICS.
- File path không format; title có format.

---

## 17. Known constraints / pitfalls

- Không có JS unit test runner; test JS/TS chủ yếu qua typecheck/lint/browser.
- Rust tests chỉ cover một phần analyzer.
- Native build là bắt buộc sau khi sửa Rust; stale `.node` gây hành vi cũ.
- `pnpm build` khá nặng; khi chỉ sửa UI dùng build canvas + copy + restart.
- Canvas static assets nằm trong `packages/cli/assets` (ignored).
- `routogram-report/` là generated/ignored; không commit.
- `.next`/`node_modules`/`dist` không được scan.
- Stylesheet không chạy diagnostics.
- `useStore`/types không được xuất hiện trong StoresPanel.
- Header count và StoresPanel từng bị lệch; giữ left edge và top gap nhất quán.
- Node opacity < 1 sẽ làm edge xuyên qua; highlight path phải opacity 1 và background solid.
- Edge z-index thấp hơn node; không đặt edge layer lên trên nodes.
- Inspector backdrop không được dùng `fixed inset-0` toàn trang.
- Không thêm `dist-arch`; static output chuẩn là `routogram-report`.

---

## 18. Hướng dẫn cho AI agent

Khi nhận task trong repo này:

1. **Đọc file liên quan trước khi sửa**, đặc biệt:
   - `packages/types/src/index.ts`
   - Rust analyzer tương ứng
   - `packages/cli/src/index.ts`
   - `packages/canvas/src/app/features/topology/shell.tsx`
   - component UI liên quan.
2. Xác định thay đổi thuộc lớp nào:
   - scanner/schema → native + types + UI;
   - UI-only → canvas;
   - daemon/API → CLI + canvas client.
3. Giữ tương thích schema và type guard.
4. Không sửa generated assets bằng tay.
5. Build đúng ma trận ở mục 13.
6. Chạy QA tối thiểu ở mục 14.
7. Kiểm tra browser nếu thay đổi visual/interaction.
8. Dọn server, Chrome, port sau QA.
9. Báo cáo ngắn gọn:
   - nguyên nhân,
   - file đã sửa,
   - hành vi trước/sau,
   - command đã chạy,
   - lỗi còn lại nếu có.

### Ưu tiên chất lượng

- Không "fix" bằng cách ẩn lỗi hoặc thêm `any`.
- Không phá các invariant ở mục 7.3.
- Không mở rộng scope ngoài yêu cầu nếu không cần.
- Nếu có mâu thuẫn giữa yêu cầu mới và hành vi cũ, **yêu cầu mới thắng**, nhưng cập nhật tài liệu/invariant tương ứng.

---

## 19. Quick file index

| Mục đích                    | File                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| Schema/topology contract    | `packages/types/src/index.ts`                                                     |
| Rust scan orchestration     | `crates/routogram-core/src/analyzer/mod.rs`                                       |
| JSX/AST extraction          | `crates/routogram-core/src/analyzer/matcher.rs`                                   |
| CSS/token analysis          | `crates/routogram-core/src/style/mod.rs`                                          |
| Workspace/import resolution | `crates/routogram-core/src/workspace/mod.rs`                                      |
| CLI/daemon                  | `packages/cli/src/index.ts`                                                       |
| Health engine               | `packages/cli/src/health.ts`                                                      |
| Static export               | `packages/cli/src/static-export.ts`                                               |
| Canvas shell                | `packages/canvas/src/app/features/topology/shell.tsx`                             |
| React Flow canvas           | `packages/canvas/src/app/features/topology/components/topology-canvas/index.tsx`  |
| Inspector                   | `packages/canvas/src/app/features/topology/components/inspector-drawer/index.tsx` |
| Store panel                 | `packages/canvas/src/app/features/topology/components/stores-panel/index.tsx`     |
| Topology view helpers       | `packages/canvas/src/lib/utils/topology-view.ts`                                  |
| Name formatter              | `packages/canvas/src/lib/utils/format-name.ts`                                    |
| React Flow CSS overrides    | `packages/canvas/src/styles/global.css`                                           |
| Example app                 | `examples/next-pc-ecommerce/`                                                     |
| Example config              | `examples/next-pc-ecommerce/.routogramrc.json`                                    |

---

## 20. One-line mental model

> Rust proves the architecture graph; the CLI serves it and runs analysis; the canvas lets a developer read, focus, inspect, and act on that graph without losing context.

---

## 21. Standalone Workspace Host (Phase 1)

Routogram now runs as a standalone centralized daemon instead of requiring a `devDependency` in the target project.

### 21.1 User data root

Default:

```text
~/.routogram/
├── config.json
├── workspaces.json
├── workspaces/
│   └── <workspace-id>/
│       ├── snapshot.json
│       ├── health.json
│       ├── annotations.json
│       └── cache/
└── logs/
    └── daemon.log
```

Override with:

```bash
ROUTOGRAM_USER_FOLDER=/path/to/data
```

The target repository is never used for annotations, snapshots, caches, or logs.

### 21.2 Workspace contracts

Defined in `packages/types/src/index.ts`:

- `WorkspaceStatus`
- `WorkspaceSummary`
- `WorkspaceRegistry`
- `PickDirectoryResult`
- `DirectoryEntry`
- `PathInspectionResult`

`WorkspaceSummary` stores both:

```ts
projectRoot; // package.json, tsconfig, aliases, git
scanPath; // project root or project/src
```

Workspace ID:

```text
ws_<sha256(scanPath).slice(0, 12)>
```

### 21.3 CLI / manager architecture

New modules:

```text
packages/cli/src/
├── storage/user-directory.ts
├── storage/workspace-registry.ts
├── system/directory-picker.ts
├── workspace-manager.ts
└── routes/workspaces.ts
```

`WorkspaceManager` owns:

- Active workspace ID.
- Registry persistence.
- Scan orchestration through `scanWorkspaceWithOptions`.
- Snapshot/health persistence.
- Project config read + global config merge.
- Background rescan after cached activation.
- Workspace deletion without touching source folders.

Runtime contexts are dynamic:

- `root` = active `projectRoot`.
- Health / editor / git / annotations use active workspace.
- Watcher stops and restarts on `scanPath` changes.
- Config/AI/refactor/migration/simulation/drift/federation routes read active context.

### 21.4 Native scanner options

Added NAPI:

```text
scan_workspace_with_options(path, optionsJson)
```

Options:

```json
{
  "projectRoot": "/repo",
  "scanRoot": "/repo/src",
  "cacheDir": "~/.routogram/workspaces/<id>/cache"
}
```

- `projectRoot` is used for workspace metadata, aliases, framework and git.
- `scanRoot` limits file discovery.
- `cacheDir` is accepted for workspace-scoped cache layout; current incremental cache remains in-memory.
- File paths in topology remain relative to `projectRoot`.
- Rust unit test asserts scan paths create no `.routogram`/`.cache` files.

### 21.5 Workspace API

| Endpoint                              | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/workspaces`                 | Registry + active workspace                                              |
| `POST /api/workspaces/pick-directory` | Native OS folder dialog                                                  |
| `GET /api/fs/list?path=...`           | Server-side directory browser (`/api/workspaces/fs-list` alias retained) |
| `POST /api/workspaces/inspect-path`   | Validate path + preview roots/framework                                  |
| `POST /api/workspaces`                | Import, activate, scan                                                   |
| `POST /api/workspaces/:id/activate`   | Activate cached snapshot + background scan                               |
| `POST /api/workspaces/:id/rescan`     | Full rescan                                                              |
| `DELETE /api/workspaces/:id`          | Remove registry entry + user data only                                   |

When no workspace is active:

```json
{ "activeWorkspaceId": null, "topology": null }
```

### 21.6 CLI behavior

```bash
routogram
# standalone daemon, no workspace required

routogram start --dir /path/to/project
routogram start --dir /path/to/project/src
routogram start --root /path/to/project  # backward-compatible alias
```

- No arguments: use persisted active workspace or show onboarding.
- `--dir` / `--root`: import, activate and scan at startup.
- Ports can come from `~/.routogram/config.json` (`ports.daemon`, `ports.canvas`) or flags/env.
- If no workspace exists, daemon starts successfully with an empty graph.

### 21.7 Canvas workspace UX

New components:

```text
components/workspace-switcher/
├── index.tsx
└── directory-picker-modal.tsx
components/workspace-empty-state/index.tsx
```

Flow:

1. No active workspace → `WorkspaceEmptyState`.
2. “Open Folder…” → `DirectoryPickerModal`.
3. Directory selection supports:
   - Native OS picker.
   - Server-side directory browser.
   - Manual absolute path with debounced inspection.
4. Preview shows project root, scan target, detected framework and name.
5. If `src/` exists, user can toggle entire project vs `src/` only.
6. Import → active workspace → topology renders.

Header `WorkspaceSwitcher` shows:

- Active workspace name.
- Framework badge.
- Short path.
- Dropdown with switch, rescan, add, remove.

### 21.8 Workspace switching invariants

On `activeWorkspaceId` change:

- Close Inspector (`selectedNodeId = null`).
- Clear highlight/filter/store hover state.
- Remount React Flow canvas to reset ELK layout and call `fitView`.
- Reset expanded/collapsed roots.
- Reconnect workspace-scoped WebSocket.
- Ignore events whose `workspaceId` differs.

Server WebSocket events now include:

```ts
workspaceId?: string | null;
```

### 21.8.1 Vite proxy stability

`packages/canvas/vite.config.ts` installs an error handler on both `/api` and `/ws` proxies. `EPIPE` and `ECONNRESET` are swallowed so restarting the Hono daemon does not crash the Vite dev server. Other proxy errors are logged.

### 21.9 Zero-pollution contract

After scan/watch/annotate:

- No `.routogram/`, `.cache`, snapshots, logs or annotations in target repo.
- `git status --ignored` must be unchanged from baseline except pre-existing ignored build artifacts.
- Removing a workspace deletes only `~/.routogram/workspaces/<id>`.

---

## 22. Unified Framework-Agnostic Scanner

Routogram now exposes a framework-neutral architecture graph while keeping the existing React path stable.

### 22.1 Unified node kinds

Schema aliases:

```ts
UiComponentNodeKind = "component" | "ui_component";
ComposableNodeKind = "composable" | "hook";
BackendRouteNodeKind = "backend_route";
ControllerNodeKind = "controller";
```

Legacy `component`/`hook` remain valid for existing snapshots and React topology.

### 22.2 Data-flow additions

`NodeDataFlowMeta` now includes:

```ts
sideEffects?: string[];      // useEffect, watch, onMounted...
stateManagement?: string[];  // Zustand, Pinia, Nano Stores, ref...
```

These are displayed in the Inspector INFO section.

### 22.3 Rust adapters

```text
crates/routogram-core/src/analyzer/
├── ast_helpers.rs             # Oxc call/import/export helpers
├── extractors.rs              # Vue/Astro/Svelte script+style extraction
└── plugins/
    ├── mod.rs
    ├── react.rs               # useEffect/useState/Zustand/Nano
    ├── vue.rs                 # ref/reactive/watch/onMounted/Pinia
    └── backend.rs             # Hono/Express/Nest route detection
```

Framework plugins produce:

- `sideEffects`
- `stateManagement`
- `backend_route` / `controller` node signals

Vue/Astro/Svelte component nodes use `kind: "ui_component"` and preserve the `component:<file>` ID convention. React nodes continue to use `component`.

### 22.4 Backend graph

Hono/Express route calls and Nest decorators produce boundary nodes:

```text
GET /api/health      framework: hono
POST /api/users      framework: hono
```

Unconnected backend routes are added as canvas roots so they remain visible even without API edges.

### 22.5 Framework badges

Canvas supports framework badges for:

```text
React, Vue, Solid, Preact, Lit, Astro, Svelte,
Hono, Nest, Express, Vanilla
```

### 22.6 Tests

- Vue SFC: extracts `ui_component`, `watch`/`onMounted`, `ref`.
- Hono: extracts `backend_route` nodes with methods and paths.
- Oxc helpers: calls, imports, exports.
- React regression: Next.js example still renders 55 nodes / 62 edges with React badges and no console errors.
