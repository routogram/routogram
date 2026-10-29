import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  RoutogramDriftFinding,
  RoutogramDriftPayload,
  RoutogramTopology,
} from "@routogram/types";

export function detectDrift(
  root: string,
  previous: RoutogramTopology | null,
  next: RoutogramTopology,
): RoutogramDriftFinding[] {
  const previousKeys = new Set(
    previous ? collectFindings(root, previous).map((finding) => finding.id) : [],
  );
  return collectFindings(root, next).filter((finding) => !previousKeys.has(finding.id));
}

export function notifyDrift(payload: RoutogramDriftPayload): void {
  const first = payload.findings[0];
  if (!first) {
    return;
  }

  console.error(`\n\x1b[31m[drift] CRITICAL: ${first.message}\x1b[0m`);
  for (const finding of payload.findings.slice(1)) {
    console.error(`[drift] ${finding.message}`);
  }

  if (process.platform === "darwin") {
    const script = `display notification ${quote(first.message)} with title "Routogram drift detected"`;
    spawn("osascript", ["-e", script], { stdio: "ignore", detached: true }).unref();
  } else if (process.platform === "linux") {
    spawn("notify-send", ["Routogram drift detected", first.message], {
      stdio: "ignore",
      detached: true,
    }).unref();
  }
}

function collectFindings(root: string, topology: RoutogramTopology): RoutogramDriftFinding[] {
  const findings = new Map<string, RoutogramDriftFinding>();
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));

  for (const cycle of cycles(topology)) {
    const ids = [...cycle].sort();
    const files = ids
      .map((id) => nodes.get(id)?.file)
      .filter((file): file is string => Boolean(file));
    const id = `cycle:${ids.join(">")}`;
    findings.set(id, {
      id,
      kind: "circular-dependency",
      severity: "critical",
      message: `Circular dependency detected across ${ids.length} modules: ${ids.join(" → ")}.`,
      nodeIds: ids,
      files: [...new Set(files)],
      suggestedFix: "Break the cycle with a boundary module or lazy dynamic import.",
    });
  }

  for (const node of topology.nodes) {
    if (node.kind !== "component" || node.meta?.isServerComponent !== false) {
      continue;
    }
    const file = resolve(root, node.file);
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (/from\s+["']server-only["']|from\s+["'][^"']*server-secret/.test(source)) {
      findings.set(`secret:${node.id}`, {
        id: `secret:${node.id}`,
        kind: "server-secret-in-client",
        severity: "critical",
        message: `Client component ${node.name} imports a server-only secret module.`,
        nodeIds: [node.id],
        files: [node.file],
        suggestedFix: "Move the secret access behind a server action or API boundary.",
      });
    }
  }

  return [...findings.values()];
}

function cycles(topology: RoutogramTopology): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of topology.edges) {
    if (!["renders", "cross_package", "dynamic_imports"].includes(edge.kind)) {
      continue;
    }
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  }

  const found: string[][] = [];
  const seen = new Set<string>();
  const visit = (node: string, stack: string[], visiting: Set<string>) => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const cycle = stack.slice(start);
        const key = [...cycle].sort().join(">");
        if (!seen.has(key)) {
          seen.add(key);
          found.push(cycle);
        }
      }
      return;
    }
    if (stack.length > 12) {
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      visit(next, stack, visiting);
    }
    stack.pop();
    visiting.delete(node);
  };

  for (const node of adjacency.keys()) {
    visit(node, [], new Set());
  }

  return found;
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}
