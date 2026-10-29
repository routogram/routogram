import { API, apiUrl } from "@/lib/constants";

export type AnnotationKind = "pin" | "adr" | "boundary";

export type ArchitectureAnnotation = {
  id: string;
  nodeIds: string[];
  kind: AnnotationKind;
  title: string;
  body: string;
  author: string;
  color: string;
  adrUrl?: string;
  region?: { x: number; y: number; width: number; height: number };
  createdAt: string;
  updatedAt: string;
};

export async function fetchAnnotations(): Promise<ArchitectureAnnotation[]> {
  const response = await fetch(apiUrl(API.annotations));
  if (!response.ok) {
    throw new Error(`Annotation request failed with ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!isStore(payload)) {
    throw new Error("The daemon returned an invalid annotation store.");
  }
  return payload.annotations;
}

export async function createAnnotation(input: {
  nodeIds: string[];
  kind?: AnnotationKind;
  title: string;
  body: string;
  author: string;
  adrUrl?: string;
  region?: { x: number; y: number; width: number; height: number };
}): Promise<ArchitectureAnnotation> {
  const response = await fetch(apiUrl(API.annotations), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessage(payload, `Annotation create failed with ${response.status}`));
  }
  if (!isAnnotation(payload)) {
    throw new Error("The daemon returned an invalid annotation.");
  }
  return payload;
}

export async function deleteAnnotation(id: string): Promise<void> {
  const response = await fetch(apiUrl(`${API.annotations}/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Annotation delete failed with ${response.status}`);
  }
}

function isStore(value: unknown): value is { annotations: ArchitectureAnnotation[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { annotations?: unknown }).annotations)
  );
}

function isAnnotation(value: unknown): value is ArchitectureAnnotation {
  return (
    isStore({ annotations: [value] }) &&
    typeof (value as ArchitectureAnnotation).id === "string" &&
    typeof (value as ArchitectureAnnotation).title === "string"
  );
}

function errorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}
