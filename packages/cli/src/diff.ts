import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getNodeStyleMetrics,
  isRoutogramTopology,
  type RoutogramNode,
  type RoutogramTopology,
} from "@routogram/types";

import { loadNativeCore } from "./native.js";

export interface DiffOptions {
  cwd: string;
  base: string;
  head: string;
  failOnDeadCss: boolean;
  maxBlastRadius: number;
}

export interface DiffNodeSummary {
  id: string;
  name: string;
  kind: string;
}

export interface DeadCssDiff {
  nodeId: string;
  nodeName: string;
  file: string;
  classes: string[];
}

export interface BoundaryViolation {
  nodeId: string;
  nodeName: string;
  targetName: string;
  message: string;
}

export interface BlastRadiusViolation {
  nodeId: string;
  nodeName: string;
  warningCount: number;
  selectors: string[];
}

export interface CountSnapshot {
  routes: number;
  components: number;
  boundaries: number;
  stylesheets: number;
  deadCssClasses: number;
  blastWarnings: number;
}

export interface DiffReport {
  base: string;
  head: string;
  baseCounts: CountSnapshot;
  headCounts: CountSnapshot;
  addedNodes: DiffNodeSummary[];
  removedNodes: DiffNodeSummary[];
  newDeadCss: DeadCssDiff[];
  boundaryViolations: BoundaryViolation[];
  blastRadiusViolations: BlastRadiusViolation[];
  passed: boolean;
  gateReasons: string[];
}

export function runArchitectureDiff(options: DiffOptions): DiffReport {
  const native = loadNativeCore();
  if (!native.core) {
    throw new Error(native.error ?? "The native scanner is required for routogram diff.");
  }

  const repositoryRoot = git(["rev-parse", "--show-toplevel"], options.cwd).trim();
  const workspace = mkdtempSync(join(tmpdir(), "routogram-diff-"));
  const baseDir = join(workspace, "base");
  const headDir = join(workspace, "head");

  try {
    addWorktree(repositoryRoot, baseDir, options.base);
    addWorktree(repositoryRoot, headDir, options.head);

    const baseTopology = scanTopology(native.core.scanWorkspace(baseDir));
    const headTopology = scanTopology(native.core.scanWorkspace(headDir));

    return compareTopologies(baseTopology, headTopology, options);
  } finally {
    removeWorktree(repositoryRoot, baseDir);
    removeWorktree(repositoryRoot, headDir);
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function formatDiffMarkdown(report: DiffReport): string {
  const lines = [
    "## Routogram Architecture Gate",
    "",
    `**Base:** \`${report.base}\` → **Head:** \`${report.head}\``,
    "",
    "| Metric | Base | Head | Delta |",
    "| --- | ---: | ---: | ---: |",
    metricRow("Routes / layouts", report.baseCounts.routes, report.headCounts.routes),
    metricRow("Components", report.baseCounts.components, report.headCounts.components),
    metricRow("API boundaries", report.baseCounts.boundaries, report.headCounts.boundaries),
    metricRow("Stylesheets", report.baseCounts.stylesheets, report.headCounts.stylesheets),
    metricRow(
      "Dead CSS classes",
      report.baseCounts.deadCssClasses,
      report.headCounts.deadCssClasses,
    ),
    metricRow(
      "Blast-radius warnings",
      report.baseCounts.blastWarnings,
      report.headCounts.blastWarnings,
    ),
    "",
    `### Added nodes (${report.addedNodes.length})`,
    "",
    ...nodeList(report.addedNodes),
    "",
    `### Removed nodes (${report.removedNodes.length})`,
    "",
    ...nodeList(report.removedNodes),
    "",
    `### New Dead CSS (${report.newDeadCss.length})`,
    "",
    ...deadCssList(report.newDeadCss),
    "",
    `### Boundary violations (${report.boundaryViolations.length})`,
    "",
    ...boundaryList(report.boundaryViolations),
    "",
    `### Blast-radius gate (${report.blastRadiusViolations.length})`,
    "",
    ...blastList(report.blastRadiusViolations),
    "",
    `### Gate result: ${report.passed ? "PASS" : "FAIL"}`,
    "",
    ...(report.gateReasons.length > 0
      ? report.gateReasons.map((reason) => `- ${reason}`)
      : ["- No blocking architecture regressions detected."]),
    "",
  ];

  return lines.join("\n");
}

export function formatDiffJson(report: DiffReport): string {
  return JSON.stringify(report, null, 2);
}

function compareTopologies(
  base: RoutogramTopology,
  head: RoutogramTopology,
  options: DiffOptions,
): DiffReport {
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const headNodes = new Map(head.nodes.map((node) => [node.id, node]));
  const addedNodes = head.nodes.filter((node) => !baseNodes.has(node.id)).map(summarizeNode);
  const removedNodes = base.nodes.filter((node) => !headNodes.has(node.id)).map(summarizeNode);
  const newDeadCss = collectNewDeadCss(base, head);
  const boundaryViolations = collectNewBoundaryViolations(base, head);
  const blastRadiusViolations = collectBlastRadiusViolations(base, head, options.maxBlastRadius);
  const gateReasons = [
    ...(boundaryViolations.length > 0
      ? [`${boundaryViolations.length} new client/server boundary violation(s).`]
      : []),
    ...(blastRadiusViolations.length > 0
      ? [
          `${blastRadiusViolations.length} component(s) exceed the blast-radius threshold of ${options.maxBlastRadius}.`,
        ]
      : []),
    ...(options.failOnDeadCss && newDeadCss.length > 0
      ? [`${newDeadCss.length} component(s) introduced new Dead CSS.`]
      : []),
  ];

  return {
    base: options.base,
    head: options.head,
    baseCounts: countSnapshot(base),
    headCounts: countSnapshot(head),
    addedNodes,
    removedNodes,
    newDeadCss,
    boundaryViolations,
    blastRadiusViolations,
    passed: gateReasons.length === 0,
    gateReasons,
  };
}

function collectNewDeadCss(base: RoutogramTopology, head: RoutogramTopology): DeadCssDiff[] {
  const baseMetrics = new Map(
    base.nodes.map((node) => [node.id, getNodeStyleMetrics(node)?.unusedClasses ?? []]),
  );
  const newDeadCss: DeadCssDiff[] = [];

  for (const node of head.nodes) {
    const metrics = getNodeStyleMetrics(node);
    if (!metrics || metrics.unusedClasses.length === 0) {
      continue;
    }

    const baseUnused = new Set(baseMetrics.get(node.id) ?? []);
    const classes = metrics.unusedClasses.filter((className) => !baseUnused.has(className));

    if (classes.length > 0) {
      newDeadCss.push({
        nodeId: node.id,
        nodeName: node.name,
        file: node.file,
        classes,
      });
    }
  }

  return newDeadCss;
}

function collectNewBoundaryViolations(
  base: RoutogramTopology,
  head: RoutogramTopology,
): BoundaryViolation[] {
  const baseViolations = new Set(
    collectBoundaryViolations(base).map(
      (violation) => `${violation.nodeId}->${violation.targetName}`,
    ),
  );

  return collectBoundaryViolations(head).filter(
    (violation) => !baseViolations.has(`${violation.nodeId}->${violation.targetName}`),
  );
}

function collectBoundaryViolations(topology: RoutogramTopology): BoundaryViolation[] {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const violations: BoundaryViolation[] = [];

  for (const edge of topology.edges) {
    if (edge.kind !== "renders" && edge.kind !== "dynamic_imports") {
      continue;
    }

    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target || source.kind !== "component" || target.kind !== "component") {
      continue;
    }

    if (effectiveRuntime(source) === "client" && effectiveRuntime(target) === "server") {
      violations.push({
        nodeId: source.id,
        nodeName: source.name,
        targetName: target.name,
        message: `Client component "${source.name}" imports server module "${target.name}".`,
      });
    }
  }

  return violations;
}

function collectBlastRadiusViolations(
  base: RoutogramTopology,
  head: RoutogramTopology,
  threshold: number,
): BlastRadiusViolation[] {
  const baseWarnings = new Map(
    base.nodes.map((node) => [node.id, getNodeStyleMetrics(node)?.blastRadiusWarnings.length ?? 0]),
  );
  const violations: BlastRadiusViolation[] = [];

  for (const node of head.nodes) {
    const metrics = getNodeStyleMetrics(node);
    const warningCount = metrics?.blastRadiusWarnings.length ?? 0;
    const baseCount = baseWarnings.get(node.id) ?? 0;

    if (warningCount > threshold && warningCount > baseCount) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        warningCount,
        selectors: metrics?.blastRadiusWarnings.map((warning) => warning.selector) ?? [],
      });
    }
  }

  return violations;
}

function countSnapshot(topology: RoutogramTopology): CountSnapshot {
  return {
    routes: topology.nodes.filter(
      (node) => node.layer === "macro" && (node.kind === "route" || node.kind === "layout"),
    ).length,
    components: topology.nodes.filter((node) => node.kind === "component").length,
    boundaries: topology.nodes.filter((node) => node.layer === "boundary").length,
    stylesheets: topology.nodes.filter((node) => node.layer === "micro").length,
    deadCssClasses: topology.nodes.reduce(
      (total, node) => total + (getNodeStyleMetrics(node)?.unusedClasses.length ?? 0),
      0,
    ),
    blastWarnings: topology.nodes.reduce(
      (total, node) => total + (getNodeStyleMetrics(node)?.blastRadiusWarnings.length ?? 0),
      0,
    ),
  };
}

function effectiveRuntime(node: RoutogramNode): "server" | "client" | "universal" {
  if (node.meta?.isServerComponent) {
    return "server";
  }

  return node.runtime ?? "universal";
}

function summarizeNode(node: RoutogramNode): DiffNodeSummary {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
  };
}

function scanTopology(raw: string): RoutogramTopology {
  const parsed: unknown = JSON.parse(raw);

  if (!isRoutogramTopology(parsed)) {
    throw new Error("The native scanner returned an invalid topology while diffing.");
  }

  return parsed;
}

function addWorktree(repositoryRoot: string, directory: string, reference: string): void {
  try {
    git(["worktree", "add", "--detach", "--force", directory, reference], repositoryRoot);
  } catch (error) {
    throw new Error(
      `Unable to create a git worktree for "${reference}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function removeWorktree(repositoryRoot: string, directory: string): void {
  try {
    git(["worktree", "remove", "--force", directory], repositoryRoot);
  } catch {
    rmSync(directory, { recursive: true, force: true });
  }
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function metricRow(label: string, base: number, head: number): string {
  const delta = head - base;
  const deltaText = delta === 0 ? "0" : delta > 0 ? `+${delta}` : String(delta);

  return `| ${label} | ${base} | ${head} | ${deltaText} |`;
}

function nodeList(nodes: DiffNodeSummary[]): string[] {
  if (nodes.length === 0) {
    return ["_None._"];
  }

  return nodes.slice(0, 40).map((node) => `- \`${node.kind}\` — ${node.name} (\`${node.id}\`)`);
}

function deadCssList(items: DeadCssDiff[]): string[] {
  if (items.length === 0) {
    return ["_None._"];
  }

  return items
    .slice(0, 40)
    .map(
      (item) =>
        `- **${item.nodeName}** — ${item.classes.map((className) => `\`${className}\``).join(", ")} (${item.file})`,
    );
}

function boundaryList(items: BoundaryViolation[]): string[] {
  if (items.length === 0) {
    return ["_None._"];
  }

  return items.map((item) => `- **${item.nodeName}** — ${item.message}`);
}

function blastList(items: BlastRadiusViolation[]): string[] {
  if (items.length === 0) {
    return ["_None._"];
  }

  return items.map(
    (item) =>
      `- **${item.nodeName}** — ${item.warningCount} warning(s): ${item.selectors
        .map((selector) => `\`${selector}\``)
        .join(", ")}`,
  );
}
