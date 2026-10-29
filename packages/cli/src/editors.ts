import { resolve } from "node:path";

import type { RoutogramEditor } from "@routogram/types";

const EDITOR_ALIASES: Record<string, RoutogramEditor> = {
  code: "vscode",
  vscode: "vscode",
  cursor: "cursor",
  "vscode-insiders": "vscode-insiders",
  "code-insiders": "vscode-insiders",
  zed: "zed",
  webstorm: "webstorm",
  idea: "intellij",
  intellij: "intellij",
};

export function normalizeEditor(value: unknown): RoutogramEditor | null {
  if (typeof value !== "string") {
    return null;
  }

  return EDITOR_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function detectEditor(): RoutogramEditor {
  const configured = normalizeEditor(process.env.ROUTOGRAM_EDITOR);
  if (configured) {
    return configured;
  }

  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_AGENT) {
    return "cursor";
  }

  if (process.env.ZED_TERM || process.env.TERM_PROGRAM === "Zed") {
    return "zed";
  }

  if (process.env.WEBSTORM_HOME || process.env.TERM_PROGRAM === "WebStorm") {
    return "webstorm";
  }

  if (process.env.IDEA_INITIAL_DIRECTORIES || process.env.TERM_PROGRAM === "IntelliJ") {
    return "intellij";
  }

  if (process.env.VSCODE_INSULAR || process.env.TERM_PROGRAM === "vscode-insiders") {
    return "vscode-insiders";
  }

  return "vscode";
}

export function buildEditorUrl(
  editor: RoutogramEditor,
  absolutePath: string,
  line: number,
  column: number,
): string {
  const normalized = resolve(absolutePath).replaceAll("\\", "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encodedPath = withLeadingSlash.split("/").map(encodeURIComponent).join("/");

  switch (editor) {
    case "vscode":
      return `vscode://file${encodedPath}:${line}:${column}`;
    case "cursor":
      return `cursor://file${encodedPath}:${line}:${column}`;
    case "vscode-insiders":
      return `vscode-insiders://file${encodedPath}:${line}:${column}`;
    case "zed":
      return `zed://file${encodedPath}:${line}:${column}`;
    case "webstorm":
      return `webstorm://open?file=${encodeURIComponent(absolutePath)}&line=${line}&column=${column}`;
    case "intellij":
      return `idea://open?file=${encodeURIComponent(absolutePath)}&line=${line}&column=${column}`;
  }
}
