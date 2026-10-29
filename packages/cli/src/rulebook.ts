import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createJiti } from "jiti";

import { loadNativeCore } from "./native.js";

export type RulebookDiagnostic = {
  rule: string;
  severity: string;
  message: string;
  file?: string;
  line?: number;
  nodeId?: string;
};

export type RulebookReport = {
  diagnostics: RulebookDiagnostic[];
  errorCount: number;
  warningCount: number;
  passed: boolean;
};

type RunRulebookOptions = {
  root: string;
  configPath?: string;
};

const RULEBOOK_FILES = [
  ".routogramrc.json",
  "routogram.rulebook.ts",
  "routogram.rulebook.js",
  "routogram.rulebook.mjs",
];

const DEFAULT_CONFIG = {
  maxDepth: 6,
  boundaries: [],
  tokens: {
    prefix: "--",
    forbidHardcodedValues: false,
  },
};

export async function runRulebook(
  options: RunRulebookOptions,
): Promise<{ report: RulebookReport; configPath: string | null }> {
  const native = loadNativeCore();
  if (!native.core) {
    throw new Error(native.error ?? "The native scanner is required for test-arch.");
  }

  const loaded = await loadRulebookConfig(options.root, options.configPath);
  const raw = native.core.checkArchRulebook(options.root, JSON.stringify(loaded.config));
  const report: unknown = JSON.parse(raw);

  if (!isRulebookReport(report)) {
    throw new Error("The native scanner returned an invalid rulebook report.");
  }

  return { report, configPath: loaded.path };
}

export function formatRulebookMarkdown(report: RulebookReport, configPath: string | null): string {
  const lines = [
    "# Routogram Architecture Rulebook",
    "",
    `**Result:** ${report.passed ? "PASS" : "FAIL"} · ${report.errorCount} error(s) · ${report.warningCount} warning(s)`,
    `**Config:** ${configPath ?? "built-in defaults"}`,
    "",
  ];

  if (report.diagnostics.length === 0) {
    lines.push("_No rulebook violations._");
    return lines.join("\n");
  }

  lines.push("| Rule | Severity | Location | Message |");
  lines.push("| --- | --- | --- | --- |");

  for (const diagnostic of report.diagnostics) {
    const location = diagnostic.file
      ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}`
      : "—";
    lines.push(
      `| ${diagnostic.rule} | ${diagnostic.severity} | ${location} | ${diagnostic.message.replaceAll("|", "\\|")} |`,
    );
  }

  return lines.join("\n");
}

export function formatRulebookSarif(report: RulebookReport): string {
  const ruleIds = [...new Set(report.diagnostics.map((diagnostic) => diagnostic.rule))];
  const results = report.diagnostics.map((diagnostic) => ({
    ruleId: diagnostic.rule,
    level: diagnostic.severity === "warning" ? "warning" : "error",
    message: { text: diagnostic.message },
    ...(diagnostic.file
      ? {
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: diagnostic.file },
                region: { startLine: diagnostic.line ?? 1 },
              },
            },
          ],
        }
      : {}),
  }));

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "routogram",
              informationUri: "https://routogram.dev",
              rules: ruleIds.map((ruleId) => ({ id: ruleId })),
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  );
}

async function loadRulebookConfig(
  root: string,
  explicitPath?: string,
): Promise<{ config: Record<string, unknown>; path: string | null }> {
  const configPath = explicitPath
    ? resolve(root, explicitPath)
    : RULEBOOK_FILES.map((file) => resolve(root, file)).find((file) => existsSync(file));

  if (!configPath) {
    return { config: DEFAULT_CONFIG, path: null };
  }
  if (!existsSync(configPath)) {
    throw new Error(`Rulebook config not found: ${configPath}`);
  }

  if (configPath.endsWith(".json")) {
    const { readFileSync } = await import("node:fs");
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));

    if (!isRecord(parsed)) {
      throw new Error(`Rulebook config must be an object: ${configPath}`);
    }

    return { config: parsed, path: configPath };
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  const loaded: unknown = await jiti.import(configPath);
  const candidate = isRecord(loaded) && "default" in loaded ? loaded.default : loaded;

  if (!isRecord(candidate)) {
    throw new Error(`Rulebook config must export an object: ${configPath}`);
  }

  return { config: candidate, path: configPath };
}

function isRulebookReport(value: unknown): value is RulebookReport {
  return (
    isRecord(value) &&
    Array.isArray(value.diagnostics) &&
    typeof value.errorCount === "number" &&
    typeof value.warningCount === "number" &&
    typeof value.passed === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
