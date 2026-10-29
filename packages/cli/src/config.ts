import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AiConfig, AiProviderConfig, RoutogramConfig } from "@routogram/types";
import { createJiti } from "jiti";

const CONFIG_FILES = [
  ".routogramrc.json",
  "routogram.config.ts",
  "routogram.config.mts",
  "routogram.config.js",
  "routogram.config.mjs",
  "routogram.config.cjs",
];

export interface LoadedConfig {
  config: RoutogramConfig;
  raw: Record<string, unknown>;
  path: string | null;
}

// Config is loaded through jiti so TypeScript configs work without a build step.
// Config được tải qua jiti để file TypeScript chạy được mà không cần build.
export async function loadRoutogramConfig(
  root: string,
  explicitPath?: string,
): Promise<LoadedConfig> {
  const configPath = explicitPath
    ? resolve(root, explicitPath)
    : CONFIG_FILES.map((file) => resolve(root, file)).find((file) => existsSync(file));

  if (!configPath) {
    return { config: {}, raw: {}, path: null };
  }

  if (!existsSync(configPath)) {
    throw new Error(`Routogram config not found: ${configPath}`);
  }

  if (configPath.endsWith(".json")) {
    const content = readFileSync(configPath, "utf8");
    const parsed: unknown = JSON.parse(resolveEnvVariables(content));
    if (!isRecord(parsed)) {
      throw new Error(`Routogram config must be an object: ${configPath}`);
    }
    return {
      config: normalizeConfig(parsed),
      raw: parsed,
      path: configPath,
    };
  }

  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    moduleCache: false,
  });
  const loaded: unknown = await jiti.import(configPath);
  const candidate = isRecord(loaded) && "default" in loaded ? loaded.default : loaded;

  if (!isRecord(candidate)) {
    throw new Error(`Routogram config must export an object: ${configPath}`);
  }

  return {
    config: normalizeConfig(candidate),
    raw: candidate,
    path: configPath,
  };
}

/**
 * Resolve ${ENV_VAR} placeholders in raw config text before JSON parsing.
 * Missing variables become empty strings and emit a non-fatal warning.
 */
export function resolveEnvVariables(content: string): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = process.env[key];
    if (value === undefined) {
      console.warn(`[Routogram] Warning: Environment variable ${key} is not defined`);
      return "";
    }
    return value;
  });
}

function normalizeConfig(value: Record<string, unknown>): RoutogramConfig {
  return {
    ...(typeof value.$schema === "string" ? { $schema: value.$schema } : {}),
    framework:
      typeof value.framework === "string"
        ? (value.framework as RoutogramConfig["framework"])
        : "auto",
    ignorePatterns: Array.isArray(value.ignorePatterns)
      ? value.ignorePatterns.filter((item): item is string => typeof item === "string")
      : [],
    plugins: Array.isArray(value.plugins)
      ? value.plugins.filter(isRecord).map((plugin) => ({
          name: typeof plugin.name === "string" ? plugin.name : "anonymous-plugin",
          rules: Array.isArray(plugin.rules) ? plugin.rules : [],
          extractors: Array.isArray(plugin.extractors) ? plugin.extractors : [],
        }))
      : [],
    rules: isRecord(value.rules) ? (value.rules as RoutogramConfig["rules"]) : {},
    aliases: normalizeAliases(value.aliases),
    tokens: isRecord(value.tokens)
      ? {
          ...(typeof value.tokens.prefix === "string" ? { prefix: value.tokens.prefix } : {}),
        }
      : undefined,
    ...(typeof value.maxDepth === "number" && Number.isFinite(value.maxDepth)
      ? { maxDepth: value.maxDepth }
      : {}),
    ...(value.routerType === "app" || value.routerType === "pages"
      ? { routerType: value.routerType }
      : {}),
    ...(typeof value.root === "string" ? { root: value.root } : {}),
    ...(isRecord(value.editor) &&
    (value.editor.default === "cursor" || value.editor.default === "vscode")
      ? { editor: { default: value.editor.default } }
      : {}),
    ai: normalizeAiConfig(value.ai),
  };
}

function normalizeAiConfig(value: unknown): AiConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const providers = Array.isArray(value.providers)
    ? value.providers
        .map((provider) => normalizeAiProvider(provider))
        .filter((provider): provider is AiProviderConfig => provider !== null)
    : [];

  return {
    ...(typeof value.default === "string" && value.default.trim()
      ? { default: value.default.trim() }
      : {}),
    ...(providers.length > 0 ? { providers } : {}),
  };
}

function normalizeAiProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const provider =
    value.provider === "deepseek" ||
    value.provider === "openai" ||
    value.provider === "anthropic" ||
    value.provider === "custom"
      ? value.provider
      : null;

  if (
    !provider ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.model !== "string" ||
    !value.model.trim()
  ) {
    return null;
  }

  const apiKey = resolveEnvTemplate(typeof value.apiKey === "string" ? value.apiKey : undefined);
  const baseUrl = resolveEnvTemplate(typeof value.baseUrl === "string" ? value.baseUrl : undefined);
  const defaultEffort =
    value.defaultEffort === "Low" ||
    value.defaultEffort === "Medium" ||
    value.defaultEffort === "High"
      ? value.defaultEffort
      : undefined;

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    provider,
    model: value.model.trim(),
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(defaultEffort ? { defaultEffort } : {}),
  };
}

function resolveEnvTemplate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const resolved = value
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "")
    .trim();
  return resolved.length > 0 ? resolved : undefined;
}

function normalizeAliases(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
