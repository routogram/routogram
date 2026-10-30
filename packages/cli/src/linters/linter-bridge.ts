import { spawn } from "node:child_process";
import { relative, resolve } from "node:path";

import type {
  DiagnosticsUpdatedPayload,
  ExternalDiagnostic,
  RoutogramTopology,
} from "@routogram/types";

type LinterName = "biome" | "eslint" | "oxlint";

export async function runDetectedLintersAsync(
  projectRoot: string,
  scanPath: string,
  linters: LinterName[],
): Promise<ExternalDiagnostic[]> {
  const results = await Promise.all(
    linters.map((linter) => runLinter(projectRoot, scanPath, linter)),
  );
  const seen = new Set<string>();
  return results.flat().filter((diagnostic) => {
    if (seen.has(diagnostic.id)) return false;
    seen.add(diagnostic.id);
    return true;
  });
}

export function attachDiagnosticsToTopology(
  topology: RoutogramTopology,
  externalDiagnostics: ExternalDiagnostic[],
): DiagnosticsUpdatedPayload["nodes"] {
  const nodes: DiagnosticsUpdatedPayload["nodes"] = {};

  for (const node of topology.nodes) {
    if (
      node.kind === "style" ||
      node.kind === "token" ||
      /\.(css|scss|sass|less|pcss)$/i.test(node.file)
    ) {
      continue;
    }

    const file = node.file.replaceAll("\\", "/");
    const diagnostics = externalDiagnostics.filter((diagnostic) => {
      const diagnosticFile = diagnostic.filePath.replaceAll("\\", "/");
      return diagnosticFile === file || diagnosticFile.endsWith(`/${file}`);
    });
    const health = diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? "danger"
      : diagnostics.some((diagnostic) => diagnostic.severity === "warning")
        ? "warning"
        : "safe";
    nodes[node.id] = { health, diagnostics };
  }

  return nodes;
}

async function runLinter(
  projectRoot: string,
  scanPath: string,
  linter: LinterName,
): Promise<ExternalDiagnostic[]> {
  const relativeScanPath = relative(projectRoot, scanPath) || ".";
  const args =
    linter === "biome"
      ? ["--no-install", "@biomejs/biome", "check", "--reporter=json", relativeScanPath]
      : linter === "eslint"
        ? ["--no-install", "eslint", "--format", "json", relativeScanPath]
        : ["--no-install", "oxlint", "--format", "json", relativeScanPath];

  return new Promise((resolvePromise) => {
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
      cwd: projectRoot,
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        resolvePromise(normalizeOutput(linter, JSON.parse(stdout), projectRoot));
      } catch {
        resolvePromise([]);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", () => {});
    child.on("error", () => finish());
    child.on("close", () => finish());
    child.on("timeout", () => {
      child.kill();
      finish();
    });
  });
}

function normalizeOutput(
  linter: LinterName,
  payload: unknown,
  projectRoot: string,
): ExternalDiagnostic[] {
  if (linter === "eslint") {
    return normalizeEslint(payload, projectRoot);
  }
  if (linter === "biome") {
    return normalizeBiome(payload, projectRoot);
  }
  return normalizeOxlint(payload, projectRoot);
}

function normalizeBiome(payload: unknown, projectRoot: string): ExternalDiagnostic[] {
  const diagnostics = arrayValue(recordValue(payload)?.diagnostics) ?? [];
  return diagnostics.flatMap((entry, index) => {
    const item = recordValue(entry);
    const location = recordValue(item?.location);
    const pathValue = recordValue(location?.path)?.file ?? location?.path;
    const path = stringValue(pathValue);
    const span = arrayValue(location?.span);
    const start = typeof span?.[0] === "number" ? span[0] : 0;
    const filePath = normalizeFile(stringValue(path), projectRoot);
    if (!filePath) return [];
    const category = stringValue(item?.category) ?? "biome";
    return [
      {
        id: `biome:${category}:${filePath}:${start}:${index}`,
        ruleId: category,
        source: "biome" as const,
        severity:
          stringValue(item?.severity) === "error" || category.includes("error")
            ? ("error" as const)
            : ("warning" as const),
        message: stringValue(item?.message) ?? "Biome diagnostic",
        filePath,
        line: typeof item?.line === "number" ? item.line : undefined,
      },
    ];
  });
}

function normalizeEslint(payload: unknown, projectRoot: string): ExternalDiagnostic[] {
  const files = Array.isArray(payload) ? payload : [];
  return files.flatMap((entry) => {
    const file = recordValue(entry);
    const filePath = normalizeFile(stringValue(file?.filePath), projectRoot);
    if (!filePath) return [];
    const messages = arrayValue(file?.messages) ?? [];
    return messages.flatMap((message, index) => {
      const item = recordValue(message);
      if (!item) return [];
      return [
        {
          id: `eslint:${filePath}:${item.line}:${item.column}:${index}`,
          ruleId: stringValue(item.ruleId) ?? "eslint",
          source: "eslint" as const,
          severity: item.severity === 2 ? ("error" as const) : ("warning" as const),
          message: stringValue(item.message) ?? "ESLint diagnostic",
          filePath,
          line: typeof item.line === "number" ? item.line : undefined,
          column: typeof item.column === "number" ? item.column : undefined,
        },
      ];
    });
  });
}

function normalizeOxlint(payload: unknown, projectRoot: string): ExternalDiagnostic[] {
  const data = recordValue(payload);
  const diagnostics = arrayValue(data?.diagnostics) ?? (Array.isArray(payload) ? payload : []);
  return diagnostics.flatMap((entry, index) => {
    const item = recordValue(entry);
    const filePath = normalizeFile(
      stringValue(item?.filename) ?? stringValue(item?.file),
      projectRoot,
    );
    if (!filePath) return [];
    const label = recordValue(arrayValue(item?.labels)?.[0]);
    return [
      {
        id: `oxlint:${filePath}:${item?.line}:${index}`,
        ruleId: stringValue(item?.code) ?? "oxlint",
        source: "oxlint" as const,
        severity:
          stringValue(item?.severity) === "error" ? ("error" as const) : ("warning" as const),
        message: stringValue(item?.message) ?? "Oxlint diagnostic",
        filePath,
        line: typeof item?.line === "number" ? item.line : undefined,
        column:
          typeof label?.column === "number"
            ? label.column
            : typeof item?.column === "number"
              ? item.column
              : undefined,
      },
    ];
  });
}

function normalizeFile(value: string | undefined, projectRoot: string): string | null {
  if (!value) return null;
  const absolute = resolve(projectRoot, value);
  const relativePath = relative(projectRoot, absolute).replaceAll("\\", "/");
  return relativePath.startsWith("..") ? null : relativePath;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
