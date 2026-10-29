import {
  isRoutogramTopology,
  type RoutogramConfig,
  type RoutogramLintDiagnostic,
  type RoutogramLintSummary,
  type RoutogramRule,
  type RoutogramRuleSetting,
  type RoutogramTopology,
} from "@routogram/types";

import { loadRoutogramConfig } from "./config.js";
import { loadNativeCore } from "./native.js";

interface LintOptions {
  root: string;
  configPath?: string;
}

interface RuleSelection {
  rule: RoutogramRule;
  severity: "error" | "warning";
  options: Record<string, unknown>;
}

const DEFAULT_RULES: Record<string, RoutogramRuleSetting> = {
  "max-component-depth": [1, { max: 6 }],
  "no-orphan-components": 1,
};

const BUILTIN_RULES: RoutogramRule[] = [
  {
    meta: {
      id: "max-component-depth",
      description: "Limits the component render depth from a root component.",
    },
    run({ topology, options, report }) {
      const max = typeof options.max === "number" ? options.max : 6;
      const depth = componentDepths(topology);

      for (const [nodeId, value] of depth) {
        if (value <= max) {
          continue;
        }

        const node = topology.nodes.find((candidate) => candidate.id === nodeId);
        report({
          message: `Component depth ${value} exceeds the configured maximum of ${max}.`,
          nodeId,
          file: node?.file,
          line: node?.source?.line,
        });
      }
    },
  },
  {
    meta: {
      id: "no-orphan-components",
      description: "Flags components that are not connected to routes or other components.",
    },
    run({ topology, report }) {
      const connected = new Set<string>();

      for (const edge of topology.edges) {
        if (
          edge.kind === "renders" ||
          edge.kind === "cross_package" ||
          edge.kind === "dynamic_imports"
        ) {
          connected.add(edge.source);
          connected.add(edge.target);
        }
      }

      for (const node of topology.nodes) {
        if (node.kind !== "component" || connected.has(node.id)) {
          continue;
        }

        report({
          message: `Component "${node.name}" is orphaned from every route and component tree.`,
          nodeId: node.id,
          file: node.file,
          line: node.source?.line,
        });
      }
    },
  },
  {
    meta: {
      id: "enforce-token-prefix",
      description: "Requires design tokens to use a company-specific prefix.",
    },
    run({ topology, options, report }) {
      const prefix = typeof options.prefix === "string" ? options.prefix : "--";

      for (const token of topology.tokens ?? []) {
        if (token.name.startsWith(prefix)) {
          continue;
        }

        report({
          message: `Token "${token.name}" does not start with "${prefix}".`,
          file: token.file,
          line: token.line,
        });
      }
    },
  },
];

export async function runLint(options: LintOptions): Promise<RoutogramLintSummary> {
  const native = loadNativeCore();
  if (!native.core) {
    throw new Error(native.error ?? "The native scanner is required for routogram lint.");
  }

  const loaded = await loadRoutogramConfig(options.root, options.configPath);
  const config = loaded.config;
  const topology = await applyPlugins(
    applyIgnorePatterns(scanTopology(native.core.scanWorkspace(options.root)), config),
    config,
  );
  const ruleSelections = resolveRules(config);
  const diagnostics: RoutogramLintDiagnostic[] = [];

  for (const selection of ruleSelections) {
    const reported: RoutogramLintDiagnostic[] = [];
    const context = {
      topology,
      options: selection.options,
      report: (diagnostic: Omit<RoutogramLintDiagnostic, "ruleId" | "severity">) => {
        reported.push({
          ...diagnostic,
          ruleId: selection.rule.meta.id,
          severity: selection.severity,
        });
      },
    };

    try {
      const returned = await selection.rule.run(context);

      if (Array.isArray(returned)) {
        diagnostics.push(
          ...returned.map((diagnostic) => ({
            ...diagnostic,
            severity: selection.severity,
          })),
        );
      }

      diagnostics.push(...reported);
    } catch (error) {
      diagnostics.push({
        ruleId: selection.rule.meta.id,
        severity: "error",
        message: `Rule failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  diagnostics.sort((left, right) => {
    const leftFile = left.file ?? "";
    const rightFile = right.file ?? "";

    return (
      leftFile.localeCompare(rightFile) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      left.ruleId.localeCompare(right.ruleId)
    );
  });

  return {
    diagnostics,
    errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    configPath: loaded.path,
    filesScanned: topology.stats.filesScanned,
  };
}

export function formatLintSummary(summary: RoutogramLintSummary): string {
  const lines = [
    `Routogram lint — ${summary.errorCount} error(s), ${summary.warningCount} warning(s)`,
    summary.configPath ? `Config: ${summary.configPath}` : "Config: built-in defaults",
    "",
  ];

  if (summary.diagnostics.length === 0) {
    lines.push("No architecture rule violations.");
    return lines.join("\n");
  }

  for (const diagnostic of summary.diagnostics) {
    const location = diagnostic.file
      ? ` ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}`
      : "";

    lines.push(
      `${diagnostic.severity.padEnd(7)} ${diagnostic.ruleId}  ${diagnostic.message}${location}`,
    );
  }

  return lines.join("\n");
}

function resolveRules(config: RoutogramConfig): RuleSelection[] {
  const configuredRules = Object.keys(config.rules ?? {}).length > 0 ? config.rules : DEFAULT_RULES;
  const pluginRules = new Map<string, RoutogramRule>();

  for (const plugin of config.plugins ?? []) {
    for (const rule of plugin.rules ?? []) {
      if (rule?.meta?.id) {
        pluginRules.set(rule.meta.id, rule);
      }
    }
  }

  const available = new Map(BUILTIN_RULES.map((rule) => [rule.meta.id, rule]));
  for (const [ruleId, rule] of pluginRules) {
    available.set(ruleId, rule);
  }

  const selections: RuleSelection[] = [];

  for (const [ruleId, setting] of Object.entries(configuredRules ?? {})) {
    const severityNumber = Array.isArray(setting) ? setting[0] : setting;
    if (severityNumber === 0) {
      continue;
    }

    const rule = available.get(ruleId);
    if (!rule) {
      continue;
    }

    selections.push({
      rule,
      severity: severityNumber === 2 ? "error" : "warning",
      options: Array.isArray(setting) ? (setting[1] ?? {}) : {},
    });
  }

  return selections;
}

function applyIgnorePatterns(
  topology: RoutogramTopology,
  config: RoutogramConfig,
): RoutogramTopology {
  const patterns = (config.ignorePatterns ?? []).map(globToRegExp);
  if (patterns.length === 0) {
    return topology;
  }

  const ignored = (file: string): boolean =>
    patterns.some((pattern) => pattern.test(file.replaceAll("\\", "/")));
  const nodes = topology.nodes.filter((node) => !ignored(node.file));
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    ...topology,
    nodes,
    edges: topology.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    tokens: (topology.tokens ?? []).filter((token) => !ignored(token.file)),
  };
}

async function applyPlugins(
  initial: RoutogramTopology,
  config: RoutogramConfig,
): Promise<RoutogramTopology> {
  let topology = initial;

  for (const plugin of config.plugins ?? []) {
    for (const extractor of plugin.extractors ?? []) {
      const result = await extractor.extract(topology);

      if (isRoutogramTopology(result)) {
        topology = result;
      }
    }
  }

  return topology;
}

function scanTopology(raw: string): RoutogramTopology {
  const parsed: unknown = JSON.parse(raw);

  if (!isRoutogramTopology(parsed)) {
    throw new Error("The native scanner returned an invalid topology while linting.");
  }

  return parsed;
}

function componentDepths(topology: RoutogramTopology): Map<string, number> {
  const components = topology.nodes
    .filter((node) => node.kind === "component")
    .map((node) => node.id);
  const componentSet = new Set(components);
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of topology.edges) {
    if (
      (edge.kind !== "renders" && edge.kind !== "cross_package") ||
      !componentSet.has(edge.source) ||
      !componentSet.has(edge.target)
    ) {
      continue;
    }

    const list = children.get(edge.source) ?? [];
    list.push(edge.target);
    children.set(edge.source, list);
    hasParent.add(edge.target);
  }

  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const depth = (nodeId: string): number => {
    const cached = depths.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(nodeId)) {
      return 0;
    }

    visiting.add(nodeId);
    const childDepths = (children.get(nodeId) ?? []).map(depth);
    visiting.delete(nodeId);
    const value = 1 + (childDepths.length > 0 ? Math.max(...childDepths) : 0);
    depths.set(nodeId, value);

    return value;
  };

  for (const component of components) {
    if (!hasParent.has(component)) {
      depth(component);
    }
  }
  for (const component of components) {
    depth(component);
  }

  return depths;
}

function globToRegExp(pattern: string): RegExp {
  let expression = "^";
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "*") {
      if (normalized[index + 1] === "*") {
        index += 1;
        if (normalized[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character?.replace(/[.+^${}()|[\]\\]/g, "\\$&") ?? "";
    }
  }

  expression += "$";
  return new RegExp(expression);
}
