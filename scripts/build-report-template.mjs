import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runStaticExport } from "../packages/cli/dist/static-export.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const output = resolve(repositoryRoot, "packages/cli/assets/report-template.html");
const buildDirectory = mkdtempSync(join(tmpdir(), "routogram-report-template-"));
const topology = {
  schemaVersion: 2,
  generator: { name: "routogram", version: "0.1.0" },
  root: "",
  generatedAt: new Date(0).toISOString(),
  stats: { filesScanned: 0, durationMs: 0, warnings: [] },
  nodes: [],
  edges: [],
  tokens: [],
};

try {
  rmSync(output, { force: true });
  runStaticExport({ root: repositoryRoot, outDir: buildDirectory, topology });
  writeFileSync(output, readFileSync(join(buildDirectory, "index.html")));
  console.log(`report template bundled into ${output}`);
} finally {
  rmSync(buildDirectory, { recursive: true, force: true });
}
