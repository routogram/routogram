import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type Diagnostic,
  type NodeHealthData,
  type PluginContext,
  type PluginDefinition,
  parseSourceFile,
  resolveNodeHealth,
  shouldCheckDiagnostics,
} from "@routogram/plugin-core";
import { pluginsNext } from "@routogram/plugin-next";
import { pluginsReact } from "@routogram/plugin-react";
import { pluginsVue } from "@routogram/plugin-vue";
import type { RoutogramTopology } from "@routogram/types";

export type CodeHealthReport = {
  generatedAt: string;
  nodes: Record<string, NodeHealthData>;
};

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export function analyzeCodeHealth(root: string, topology: RoutogramTopology): CodeHealthReport {
  const files = uniqueFiles(topology);
  const diagnosticsByFile = new Map<string, Diagnostic[]>();

  for (const relative of files) {
    if (!shouldCheckDiagnostics(relative)) {
      continue;
    }

    const absolute = resolve(root, relative);
    let source: string;
    try {
      source = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (source.length > MAX_SOURCE_BYTES) {
      continue;
    }

    const plugins = pluginsForFile(relative);
    const sourceFile = parseSourceFile(
      relative.endsWith(".vue") ? `${relative}.ts` : relative,
      extractVueScript(relative, source),
    );
    const context: PluginContext = {
      filePath: absolute,
      relativePath: relative,
      source,
      sourceFile,
      files,
    };

    const diagnostics: Diagnostic[] = [];
    for (const plugin of plugins) {
      try {
        diagnostics.push(...plugin.run(context));
      } catch {
        // One malformed file should not prevent the rest of the health scan.
      }
    }
    if (diagnostics.length > 0) {
      diagnosticsByFile.set(relative, dedupe(diagnostics));
    }
  }

  const nodes: Record<string, NodeHealthData> = {};
  for (const node of topology.nodes) {
    const diagnostics = (diagnosticsByFile.get(node.file) ?? []).map((diagnostic) => ({
      ...diagnostic,
      nodeId: node.id,
    }));
    nodes[node.id] = {
      health: resolveNodeHealth(diagnostics),
      diagnostics,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes,
  };
}

function uniqueFiles(topology: RoutogramTopology): string[] {
  return [...new Set(topology.nodes.map((node) => node.file).filter(Boolean))].sort();
}

function pluginsForFile(relative: string): PluginDefinition[] {
  if (relative.endsWith(".vue")) {
    return pluginsVue;
  }
  if (relative.endsWith(".tsx") || relative.endsWith(".jsx")) {
    return [...pluginsReact, ...pluginsNext];
  }
  if (relative.endsWith(".ts") || relative.endsWith(".js")) {
    return pluginsNext;
  }
  return [];
}

function extractVueScript(relative: string, source: string): string {
  if (!relative.endsWith(".vue")) {
    return source;
  }
  return source.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
}

function dedupe(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    if (seen.has(diagnostic.id)) {
      return false;
    }
    seen.add(diagnostic.id);
    return true;
  });
}
