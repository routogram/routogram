import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import type { RoutogramTopology } from "@routogram/types";

export type SnapshotAnnotation = {
  id: string;
  nodeIds: string[];
  kind: string;
  title: string;
  body: string;
  author: string;
  color: string;
  adrUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchitectureSnapshot = {
  schemaVersion: 1;
  project: string;
  version: string;
  createdAt: string;
  generator: string;
  topology: RoutogramTopology;
  annotations: SnapshotAnnotation[];
};

export type PublishOptions = {
  root: string;
  project?: string;
  version?: string;
  hubUrl?: string;
  token?: string;
  uploadUrl?: string;
  publicUrl?: string;
  localDir?: string;
};

export type PublishResult = {
  project: string;
  version: string;
  url: string;
  file: string | null;
  bytes: number;
  mode: "hub" | "presigned" | "local";
};

export function createSnapshot(input: {
  root: string;
  topology: RoutogramTopology;
  annotations: SnapshotAnnotation[];
  project?: string;
  version?: string;
}): ArchitectureSnapshot {
  const project = input.project ?? basename(input.root) ?? "workspace";
  const version = input.version ?? "dev";

  return {
    schemaVersion: 1,
    project,
    version,
    createdAt: new Date().toISOString(),
    generator: "routogram",
    topology: scrubTopology(input.topology, input.root),
    annotations: input.annotations,
  };
}

export function scrubTopology(topology: RoutogramTopology, root: string): RoutogramTopology {
  const roots = [...new Set([root, resolve(root), safeRealpath(root)])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const scrubbed = scrubValue(structuredClone(topology), roots) as RoutogramTopology;
  scrubbed.root = ".";

  return scrubbed;
}

export async function publishSnapshot(
  options: PublishOptions & { topology: RoutogramTopology; annotations: SnapshotAnnotation[] },
): Promise<PublishResult> {
  const snapshot = createSnapshot(options);
  const body = JSON.stringify(snapshot, null, 2);
  const bytes = Buffer.byteLength(body);
  const project = snapshot.project;
  const version = snapshot.version;
  const hubUrl = options.hubUrl ?? process.env.ROUTOGRAM_HUB_URL;
  const token = options.token ?? process.env.ROUTOGRAM_HUB_TOKEN;
  const uploadUrl = options.uploadUrl ?? process.env.ROUTOGRAM_HUB_UPLOAD_URL;
  const publicUrl = options.publicUrl ?? process.env.ROUTOGRAM_HUB_PUBLIC_URL;

  if (uploadUrl) {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response.ok) {
      throw new Error(`Snapshot upload failed with ${response.status}.`);
    }
    return {
      project,
      version,
      url:
        publicUrl ?? `${hubUrl?.replace(/\/$/, "") ?? ""}/projects/${project}/snapshots/${version}`,
      file: null,
      bytes,
      mode: "presigned",
    };
  }

  if (hubUrl) {
    const endpoint = `${hubUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(project)}/snapshots/${encodeURIComponent(version)}`;
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Hub publish failed with ${response.status}.`);
    }
    const result: unknown = await response.json().catch(() => null);
    const url =
      typeof result === "object" &&
      result !== null &&
      typeof (result as { url?: unknown }).url === "string"
        ? (result as { url: string }).url
        : `${hubUrl.replace(/\/$/, "")}/projects/${project}/snapshots/${version}`;

    return { project, version, url, file: null, bytes, mode: "hub" };
  }

  const directory = resolve(options.localDir ?? resolve(options.root, ".routogram/snapshots"));
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, `${project}-${version}.json`);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(file, body);

  return {
    project,
    version,
    url: `file://${file}`,
    file,
    bytes,
    mode: "local",
  };
}

function scrubValue(value: unknown, roots: string[]): unknown {
  if (typeof value === "string") {
    return roots.reduce((current, root) => current.replaceAll(root, "."), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, roots));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = scrubValue(nested, roots);
      }
    }
    return result;
  }
  return value;
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isSensitiveKey(key: string): boolean {
  return /^(secret|password|api[-_]?key|access[-_]?key|private[-_]?key|auth[-_]?token)$/i.test(key);
}
