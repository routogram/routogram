import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { PluginManifest, PluginRegistryState } from "@routogram/types";

const BUILTIN_CATALOG: PluginManifest[] = [
  {
    id: "plugin-biome",
    name: "Biome",
    version: "1.0.0",
    kind: "linter",
    description: "Biome lint and formatting diagnostics.",
    configFiles: ["biome.json", "biome.jsonc"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-eslint",
    name: "ESLint",
    version: "1.0.0",
    kind: "linter",
    description: "ESLint diagnostics for JavaScript and TypeScript.",
    configFiles: [".eslintrc.js", ".eslintrc.json", "eslint.config.js", "eslint.config.mjs"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-oxlint",
    name: "Oxlint",
    version: "1.0.0",
    kind: "linter",
    description: "Fast Rust-based JavaScript/TypeScript linting.",
    configFiles: [".oxlintrc.json", "oxlint.json"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-react",
    name: "React Adapter",
    version: "1.0.0",
    kind: "framework",
    description: "React and Next.js architecture extraction.",
    supportedFrameworks: ["react", "next"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-vue",
    name: "Vue Adapter",
    version: "1.0.0",
    kind: "framework",
    description: "Vue and Nuxt architecture extraction.",
    supportedFrameworks: ["vue", "nuxt"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-astro",
    name: "Astro Adapter",
    version: "1.0.0",
    kind: "framework",
    description: "Astro islands and route extraction.",
    supportedFrameworks: ["astro"],
    installed: false,
    enabled: false,
  },
  {
    id: "plugin-security",
    name: "Standard Security Rules",
    version: "1.0.0",
    kind: "security",
    description: "Infinite render, listener cleanup, and prop-drilling guards.",
    installed: true,
    enabled: true,
  },
];

type LinterName = "biome" | "eslint" | "oxlint";

export async function getPluginCatalog(userDir: string): Promise<PluginManifest[]> {
  const registry = readRegistry(userDir);
  return BUILTIN_CATALOG.map((catalogEntry) => {
    const saved = registry.installed[catalogEntry.id];
    return {
      ...catalogEntry,
      ...saved,
      installed: saved?.installed ?? catalogEntry.installed,
      enabled: saved?.enabled ?? catalogEntry.enabled,
    };
  });
}

export async function installPlugin(userDir: string, pluginId: string): Promise<PluginManifest> {
  const catalog = await getPluginCatalog(userDir);
  const existing = catalog.find((plugin) => plugin.id === pluginId);
  if (!existing) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }
  if (existing.installed) {
    return existing;
  }

  const pluginDir = resolve(userDir, "plugins", pluginId);
  mkdirSync(pluginDir, { recursive: true });
  const manifest: PluginManifest = { ...existing, installed: true, enabled: true };
  writeFileSync(resolve(pluginDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    resolve(pluginDir, "index.js"),
    `export default ${JSON.stringify({ id: manifest.id, kind: manifest.kind })};\n`,
  );

  const registry = readRegistry(userDir);
  registry.installed[manifest.id] = manifest;
  writeRegistry(userDir, registry);
  return manifest;
}

export async function uninstallPlugin(userDir: string, pluginId: string): Promise<PluginManifest> {
  const catalog = await getPluginCatalog(userDir);
  const existing = catalog.find((plugin) => plugin.id === pluginId);
  if (!existing) {
    throw new Error(`Unknown plugin: ${pluginId}`);
  }

  const manifest: PluginManifest = { ...existing, installed: false, enabled: false };
  rmSync(resolve(userDir, "plugins", pluginId), { recursive: true, force: true });

  const registry = readRegistry(userDir);
  registry.installed[manifest.id] = manifest;
  writeRegistry(userDir, registry);
  return manifest;
}

export async function autoRecommendPlugins(
  targetPath: string,
  detectedFramework?: string,
): Promise<{ linters: LinterName[]; plugins: string[]; frameworks: string[] }> {
  const searchDirs = collectAncestorDirs(targetPath, 5);
  const packageJson = await readPackageDependencies(searchDirs);
  const hasDependency = (name: string) => packageJson.has(name);
  const hasConfig = (files: string[]) =>
    searchDirs.some((directory) => files.some((file) => existsSync(resolve(directory, file))));

  const linters: LinterName[] = [];
  if (hasConfig(["biome.json", "biome.jsonc"]) || hasDependency("@biomejs/biome")) {
    linters.push("biome");
  }
  if (
    hasConfig([
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc.yml",
      ".eslintrc.yaml",
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
    ]) ||
    hasDependency("eslint")
  ) {
    linters.push("eslint");
  }
  if (hasConfig([".oxlintrc.json", "oxlint.json"]) || hasDependency("oxlint")) {
    linters.push("oxlint");
  }

  const framework = detectedFramework?.toLowerCase();
  const hasNext =
    framework === "next" ||
    hasDependency("next") ||
    hasConfig(["next.config.js", "next.config.mjs", "next.config.ts"]);
  const hasReact =
    hasNext || framework === "react" || framework === "tanstack" || hasDependency("react");
  const hasVue =
    framework === "vue" || framework === "nuxt" || hasDependency("vue") || hasDependency("nuxt");
  const hasAstro = framework === "astro" || hasDependency("astro");

  const frameworks: string[] = [];
  if (hasNext) frameworks.push("next");
  if (hasReact) frameworks.push("react");
  if (hasVue) frameworks.push("vue");
  if (hasAstro) frameworks.push("astro");

  const plugins = ["plugin-security", ...linters.map((linter) => `plugin-${linter}`)];
  if (hasReact) plugins.push("plugin-react");
  if (hasVue) plugins.push("plugin-vue");
  if (hasAstro) plugins.push("plugin-astro");

  return {
    linters,
    plugins: [...new Set(plugins)],
    frameworks: [...new Set(frameworks)],
  };
}

function collectAncestorDirs(startPath: string, maxLevels = 5): string[] {
  const dirs: string[] = [];
  let current = resolve(startPath);
  for (let index = 0; index <= maxLevels; index += 1) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

async function readPackageDependencies(searchDirs: string[]): Promise<Set<string>> {
  const dependencies = new Set<string>();
  await Promise.all(
    searchDirs.map(async (directory) => {
      const packagePath = resolve(directory, "package.json");
      if (!existsSync(packagePath)) return;
      try {
        const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
        if (typeof parsed !== "object" || parsed === null) return;
        for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
          const group = (parsed as Record<string, unknown>)[key];
          if (typeof group !== "object" || group === null) continue;
          for (const dependency of Object.keys(group)) {
            dependencies.add(dependency);
          }
        }
      } catch {
        // Ignore malformed package manifests while auto-detecting.
      }
    }),
  );
  return dependencies;
}

function readRegistry(userDir: string): PluginRegistryState {
  const path = resolve(userDir, "plugins", "registry.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRegistry(parsed)) return parsed;
  } catch {
    // A missing registry is the normal first-run state.
  }
  return { version: 1, installed: {} };
}

function writeRegistry(userDir: string, registry: PluginRegistryState): void {
  mkdirSync(resolve(userDir, "plugins"), { recursive: true });
  const path = resolve(userDir, "plugins", "registry.json");
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`);
}

function isRegistry(value: unknown): value is PluginRegistryState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as PluginRegistryState).version === 1 &&
    typeof (value as PluginRegistryState).installed === "object" &&
    (value as PluginRegistryState).installed !== null
  );
}
