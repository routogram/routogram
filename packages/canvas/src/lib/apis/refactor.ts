import { API, apiUrl } from "@/lib/constants";

export type RefactorFile = {
  path: string;
  isNew: boolean;
  diff: string;
  before: string;
  after: string;
};

export type RefactorResult = {
  recipeId: string;
  targetNodeId: string;
  title: string;
  summary: string;
  diff: string;
  files: RefactorFile[];
  applied: boolean;
  changed: boolean;
  warnings: string[];
  previewOnly: boolean;
};

type RefactorInput = {
  recipeId: string;
  targetNodeId: string;
};

export function previewRefactor(input: RefactorInput): Promise<RefactorResult> {
  return requestRefactor({ ...input, previewOnly: true });
}

export function applyRefactor(input: RefactorInput): Promise<RefactorResult> {
  return requestRefactor({ ...input, previewOnly: false });
}

async function requestRefactor(
  input: RefactorInput & { previewOnly: boolean },
): Promise<RefactorResult> {
  const response = await fetch(apiUrl(API.refactor), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Refactor request failed with ${response.status}`;
    throw new Error(message);
  }

  if (!isRefactorResult(payload)) {
    throw new Error("The daemon returned an invalid refactor result.");
  }

  return payload;
}

function isRefactorResult(value: unknown): value is RefactorResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RefactorResult).diff === "string" &&
    Array.isArray((value as RefactorResult).files) &&
    typeof (value as RefactorResult).changed === "boolean"
  );
}
