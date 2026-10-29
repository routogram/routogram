import { createEmptyTopology, type RoutogramTopology } from "@routogram/types";

export function createSampleTopology(root: string): RoutogramTopology {
  const topology = createEmptyTopology(root);

  topology.stats = { filesScanned: 6, durationMs: 3, warnings: [] };
  topology.tokens = [
    {
      name: "--zl-primary",
      value: "#38bdf8",
      file: "src/styles/tokens.css",
      line: 1,
      scope: "root",
    },
    {
      name: "--zl-radius-sm",
      value: "6px",
      file: "src/styles/tokens.css",
      line: 2,
      scope: "root",
    },
    {
      name: "--zl-canvas",
      value: "#07080b",
      file: "src/styles/tokens.css",
      line: 5,
      scope: "theme",
    },
  ];
  topology.nodes = [
    {
      id: "route:home",
      layer: "macro",
      kind: "route",
      name: "Home route",
      file: "src/routes/index.tsx",
      route: "/",
      framework: "vite",
    },
    {
      id: "layout:root",
      layer: "macro",
      kind: "layout",
      name: "Root layout",
      file: "src/routes/__root.tsx",
      framework: "vite",
    },
    {
      id: "component:app-shell",
      layer: "meso",
      kind: "component",
      name: "AppShell",
      file: "src/components/app-shell.tsx",
      symbol: "AppShell",
      runtime: "server",
      meta: {
        isServerComponent: true,
        isDynamic: false,
        styleMetrics: {
          consumedTokens: ["--zl-primary", "--zl-canvas"],
          definedClassesCount: 4,
          unusedClasses: [],
          blastRadiusWarnings: [],
          stylesheets: ["src/styles/tokens.css"],
        },
      },
    },
    {
      id: "component:topology-canvas",
      layer: "meso",
      kind: "component",
      name: "TopologyCanvas",
      file: "src/components/topology-canvas.tsx",
      symbol: "TopologyCanvas",
      runtime: "client",
      meta: {
        isServerComponent: false,
        isDynamic: true,
        styleMetrics: {
          consumedTokens: ["--zl-primary", "--zl-radius-sm", "--zl-canvas", "--zl-unknown"],
          definedClassesCount: 6,
          unusedClasses: ["legacy-panel", "toolbar--deprecated"],
          unknownTokens: ["--zl-unknown"],
          blastRadiusWarnings: [
            {
              selector: ".app-shell .canvas .node.active",
              reason:
                "Combines 3 class-like selectors; broad override pressure leaks across components.",
              specificityScore: 40,
            },
            {
              selector: "#topology-root .canvas",
              reason:
                "Uses 1 ID selector(s); overriding this rule requires equal or higher ID specificity.",
              specificityScore: 110,
            },
          ],
          stylesheets: ["src/styles/topology-canvas.module.css", "src/styles/tokens.css"],
        },
      },
    },
    {
      id: "style:tokens",
      layer: "micro",
      kind: "token",
      name: "Design tokens",
      file: "src/styles/tokens.css",
      framework: "lightningcss",
    },
    {
      id: "style:topology-canvas",
      layer: "micro",
      kind: "style",
      name: "topology-canvas.module.css",
      file: "src/styles/topology-canvas.module.css",
      framework: "lightningcss",
      metadata: {
        isModule: true,
        definedClasses: 6,
        definedTokens: 2,
        blastRadiusWarnings: 2,
      },
    },
    {
      id: "api:topology",
      layer: "boundary",
      kind: "api_endpoint",
      name: "GET /api/topology",
      file: "packages/cli/src/index.ts",
      route: "/api/topology",
    },
  ];
  topology.edges = [
    {
      id: "edge:route-layout",
      kind: "routes_to",
      source: "route:home",
      target: "layout:root",
      label: "route tree",
    },
    {
      id: "edge:layout-shell",
      kind: "renders",
      source: "layout:root",
      target: "component:app-shell",
    },
    {
      id: "edge:shell-canvas",
      kind: "dynamic_imports",
      source: "component:app-shell",
      target: "component:topology-canvas",
      label: "lazy()",
    },
    {
      id: "edge:canvas-api",
      kind: "calls_api",
      source: "component:topology-canvas",
      target: "api:topology",
      label: "fetch",
    },
    {
      id: "edge:shell-tokens",
      kind: "styles_with",
      source: "component:app-shell",
      target: "style:tokens",
      label: "global",
    },
    {
      id: "edge:canvas-styles",
      kind: "styles_with",
      source: "component:topology-canvas",
      target: "style:topology-canvas",
      label: "module",
    },
  ];

  return topology;
}
