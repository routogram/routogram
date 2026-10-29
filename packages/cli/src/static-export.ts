import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RoutogramTopology } from "@routogram/types";

export interface StaticExportOptions {
  root: string;
  outDir: string;
  topology: RoutogramTopology;
}

export function runStaticExport({ root, outDir, topology }: StaticExportOptions): void {
  const templatePath = fileURLToPath(new URL("../assets/report-template.html", import.meta.url));

  if (existsSync(templatePath)) {
    writeTemplateExport(templatePath, outDir, topology);
    return;
  }

  const canvasDir = fileURLToPath(new URL("../../canvas", import.meta.url));
  const canvasRequire = createRequire(resolve(canvasDir, "package.json"));

  let viteBin: string;

  try {
    const vitePackage = canvasRequire.resolve("vite/package.json");
    viteBin = resolve(dirname(vitePackage), "bin/vite.js");
  } catch {
    viteBin = resolve(canvasDir, "node_modules/vite/bin/vite.js");
  }

  console.log(`[static] root     ${root}`);
  console.log(`[static] building canvas into ${outDir}`);

  const build = spawnSync(
    process.execPath,
    [viteBin, "build", "--mode", "static", "--outDir", outDir, "--emptyOutDir"],
    {
      cwd: canvasDir,
      env: { ...process.env, ROUTOGRAM_STATIC: "1" },
      stdio: "inherit",
    },
  );

  if (build.error) {
    throw new Error(`Canvas build failed: ${build.error.message}`);
  }

  if (build.status !== 0) {
    throw new Error(`Canvas build failed with exit code ${build.status ?? "unknown"}.`);
  }

  const indexPath = resolve(outDir, "index.html");
  const html = readFileSync(indexPath, "utf8");
  const payload = JSON.stringify(topology)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const embeddedScript = `<script>window.__ROUTOGRAM_DATA__ = ${payload};</script>`;
  let inlined = html.replace("<head>", `<head>\n    ${embeddedScript}`);

  if (inlined === html) {
    throw new Error("Could not inject the static topology snapshot into index.html.");
  }

  inlined = inlined.replace(/<link rel="modulepreload"[^>]*>/g, "");
  inlined = inlined.replace(
    /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (_match: string, source: string) => {
      const script = readFileSync(resolve(outDir, source.replace(/^\.\//, "")), "utf8");

      return `<script type="module">\n${script.replaceAll("</script", "<\\/script")}\n</script>`;
    },
  );
  inlined = inlined.replace(
    /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    (_match: string, href: string) => {
      const stylesheet = readFileSync(resolve(outDir, href.replace(/^\.\//, "")), "utf8");

      return `<style>\n${stylesheet.replaceAll("</style", "<\\/style")}\n</style>`;
    },
  );

  if (inlined.includes("./assets/")) {
    throw new Error("Static export expected a single JS/CSS bundle but found extra assets.");
  }

  writeFileSync(indexPath, inlined);
  rmSync(resolve(outDir, "assets"), { recursive: true, force: true });
  writeFileSync(resolve(outDir, "topology.json"), `${JSON.stringify(topology, null, 2)}\n`);

  const nodeCount = topology.nodes.length;
  const edgeCount = topology.edges.length;

  console.log(`[static] Report generated successfully at ${outDir}`);
  console.log(`[static] topology: ${nodeCount} nodes, ${edgeCount} edges`);
  console.log(`[static] single HTML: ${indexPath}`);
  console.log(`[static] Run 'npx serve ${outDir}' to view your architecture`);
}

function writeTemplateExport(
  templatePath: string,
  outDir: string,
  topology: StaticExportOptions["topology"],
): void {
  const template = readFileSync(templatePath, "utf8");
  const payload = JSON.stringify(topology)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const marker = "window.__ROUTOGRAM_DATA__ = ";
  const start = template.indexOf(marker);
  const end = template.indexOf(";</script>", start);

  if (start < 0 || end < 0) {
    throw new Error("The report template is missing its topology marker.");
  }

  mkdirSync(outDir, { recursive: true });
  const html = `${template.slice(0, start + marker.length)}${payload}${template.slice(end)}`;
  writeFileSync(resolve(outDir, "index.html"), html);
  writeFileSync(resolve(outDir, "topology.json"), `${JSON.stringify(topology, null, 2)}\n`);
  console.log(`[static] Report generated successfully at ${outDir}`);
  console.log(`[static] topology: ${topology.nodes.length} nodes, ${topology.edges.length} edges`);
  console.log(`[static] single HTML: ${resolve(outDir, "index.html")}`);
  console.log(`[static] Run 'npx serve ${outDir}' to view your architecture`);
}
