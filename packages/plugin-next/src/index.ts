import {
  createDiagnostic,
  type Diagnostic,
  type PluginContext,
  type PluginDefinition,
  shouldCheckDiagnostics,
  walk,
} from "@routogram/plugin-core";
import { pluginsReact } from "@routogram/plugin-react";
import * as ts from "typescript";

const CONTRACT_FILES = new Set(["template", "server", "client", "skeleton", "index"]);

export const enforceComponentContract: PluginDefinition = {
  id: "next/enforce-component-contract",
  description: "Widget folders must use the kebab-case template/server/client/skeleton contract.",
  severity: "warning",
  run(context: PluginContext): Diagnostic[] {
    const normalized = context.relativePath.replaceAll("\\", "/");
    if (!normalized.includes("/_components/") && !normalized.includes("/_shared/")) {
      return [];
    }

    const basename = normalized.split("/").at(-1) ?? "";
    const stem = basename.replace(/\.(tsx|jsx)$/, "");
    const diagnostics: Diagnostic[] = [];

    if (/^[A-Z]/.test(stem) || !CONTRACT_FILES.has(stem)) {
      diagnostics.push(
        createDiagnostic(
          enforceComponentContract,
          normalized,
          context.sourceFile,
          context.sourceFile,
          `Widget entry "${basename}" should follow the kebab-case contract (template/server/client/skeleton).`,
        ),
      );
    }

    return diagnostics;
  },
};

export const noConsoleInServer: PluginDefinition = {
  id: "next/no-console-in-server",
  description: "Server components and route handlers should not leave console statements.",
  severity: "tidy",
  run(context: PluginContext): Diagnostic[] {
    const normalized = context.relativePath.replaceAll("\\", "/");
    const basename = normalized.split("/").at(-1) ?? "";
    if (basename !== "route.ts" && basename !== "route.tsx" && basename !== "server.tsx") {
      return [];
    }

    const diagnostics: Diagnostic[] = [];
    walk(context.sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
        return;
      }
      if (node.expression.expression.getText() !== "console") {
        return;
      }
      diagnostics.push(
        createDiagnostic(
          noConsoleInServer,
          normalized,
          context.sourceFile,
          node,
          `Unexpected console.${node.expression.name.text} in a server boundary.`,
        ),
      );
    });
    return diagnostics;
  },
};

export type EnforceTokensOptions = {
  tokenPrefix?: string;
};

export function createEnforceTokensRule(options: EnforceTokensOptions = {}): PluginDefinition {
  const tokenPrefix = options.tokenPrefix?.trim();
  const message = tokenPrefix
    ? `Hardcoded color value found; use a ${tokenPrefix}* design token instead.`
    : "Hardcoded color value found. Consider using CSS variables, Tailwind theme colors, or design tokens instead.";
  const escapedPrefix = tokenPrefix?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenPattern = escapedPrefix ? new RegExp(`var\\(${escapedPrefix}`) : /var\(--[a-z0-9_-]+/i;

  return {
    id: "css/enforce-tokens",
    description:
      "Hardcoded colors should use CSS variables, Tailwind theme colors, or design tokens.",
    severity: "warning",
    run(context: PluginContext): Diagnostic[] {
      if (!shouldCheckDiagnostics(context.relativePath)) {
        return [];
      }

      const diagnostics: Diagnostic[] = [];
      const lines = context.source.split("\n");

      lines.forEach((line, index) => {
        if (tokenPattern.test(line)) {
          return;
        }
        if (!/(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(line)) {
          return;
        }
        diagnostics.push({
          id: `css/enforce-tokens:${context.relativePath}:${index + 1}:1`,
          pluginId: "css/enforce-tokens",
          severity: "warning",
          message,
          file: context.relativePath,
          line: index + 1,
          column: 1,
        });
      });

      return diagnostics;
    },
  };
}

export const enforceTokens = createEnforceTokensRule();

export const pluginsNext: PluginDefinition[] = [
  enforceComponentContract,
  noConsoleInServer,
  enforceTokens,
  ...pluginsReact,
];
