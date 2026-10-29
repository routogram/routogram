import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

export type AnnotationStore = {
  version: number;
  updatedAt: string;
  annotations: ArchitectureAnnotation[];
};

const STORE_VERSION = 1;
const FILE = ".routogram/annotations.json";
const PALETTE = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185"];

export function loadAnnotations(root: string): AnnotationStore {
  const path = storePath(root);
  if (!existsSync(path)) {
    return { version: STORE_VERSION, updatedAt: new Date(0).toISOString(), annotations: [] };
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isStore(parsed)) {
      throw new Error("invalid annotation store shape");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Unable to read ${FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function saveAnnotations(root: string, store: AnnotationStore): void {
  const path = storePath(root);
  mkdirSync(resolve(root, ".routogram"), { recursive: true });
  const temporary = `${path}.tmp`;
  store.updatedAt = new Date().toISOString();
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(temporary, path);
}

export function createAnnotation(
  root: string,
  input: {
    nodeIds: string[];
    kind?: AnnotationKind;
    title: string;
    body?: string;
    author?: string;
    color?: string;
    adrUrl?: string;
    region?: ArchitectureAnnotation["region"];
  },
): ArchitectureAnnotation {
  const store = loadAnnotations(root);
  const now = new Date().toISOString();
  const annotation: ArchitectureAnnotation = {
    id: `ann_${randomUUID()}`,
    nodeIds: input.nodeIds,
    kind: input.kind ?? (input.adrUrl ? "adr" : "pin"),
    title: input.title,
    body: input.body ?? "",
    author: input.author ?? "Anonymous",
    color: input.color ?? PALETTE[store.annotations.length % PALETTE.length] ?? "#38bdf8",
    ...(input.adrUrl ? { adrUrl: input.adrUrl } : {}),
    ...(input.region ? { region: input.region } : {}),
    createdAt: now,
    updatedAt: now,
  };
  store.annotations.push(annotation);
  saveAnnotations(root, store);
  return annotation;
}

export function updateAnnotation(
  root: string,
  id: string,
  patch: Partial<Pick<ArchitectureAnnotation, "title" | "body" | "kind" | "adrUrl" | "color">>,
): ArchitectureAnnotation {
  const store = loadAnnotations(root);
  const index = store.annotations.findIndex((annotation) => annotation.id === id);
  if (index < 0) {
    throw new Error(`Annotation not found: ${id}`);
  }
  const current = store.annotations[index];
  if (!current) {
    throw new Error(`Annotation not found: ${id}`);
  }
  const next: ArchitectureAnnotation = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.annotations[index] = next;
  saveAnnotations(root, store);
  return next;
}

export function deleteAnnotation(root: string, id: string): void {
  const store = loadAnnotations(root);
  const next = store.annotations.filter((annotation) => annotation.id !== id);
  if (next.length === store.annotations.length) {
    throw new Error(`Annotation not found: ${id}`);
  }
  store.annotations = next;
  saveAnnotations(root, store);
}

function storePath(root: string): string {
  return resolve(root, FILE);
}

function isStore(value: unknown): value is AnnotationStore {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as AnnotationStore).annotations)
  );
}
