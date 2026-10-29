import { API, apiUrl } from "@/lib/constants";

export type OpenInEditorInput = {
  filePath: string;
  line?: number;
  column?: number;
  editor?: string;
};

export type OpenInEditorResult = {
  url: string;
  file: string;
  editor: string;
  line: number;
  column: number;
};

export async function openInEditor(input: OpenInEditorInput): Promise<OpenInEditorResult> {
  const response = await fetch(apiUrl(API.ideOpen), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(payload) ?? "The daemon could not resolve this file.");
  }

  if (!isRecord(payload) || typeof payload.url !== "string") {
    throw new Error("The daemon returned an invalid editor URL.");
  }

  return {
    url: payload.url,
    file: typeof payload.file === "string" ? payload.file : input.filePath,
    editor: typeof payload.editor === "string" ? payload.editor : "vscode",
    line: typeof payload.line === "number" ? payload.line : (input.line ?? 1),
    column: typeof payload.column === "number" ? payload.column : (input.column ?? 1),
  };
}

function errorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.error !== "string") {
    return null;
  }

  return payload.error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
