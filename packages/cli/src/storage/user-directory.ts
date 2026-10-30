import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type UserDirectory = {
  root: string;
  workspaces: string;
  logs: string;
};

export function resolveUserFolder(): string {
  return resolve(process.env.ROUTOGRAM_USER_FOLDER ?? resolve(homedir(), ".routogram"));
}

export function ensureUserDirectory(): UserDirectory {
  const root = resolveUserFolder();
  const workspaces = resolve(root, "workspaces");
  const logs = resolve(root, "logs");
  mkdirSync(workspaces, { recursive: true });
  mkdirSync(logs, { recursive: true });
  ensureJsonFile(resolve(root, "config.json"), {
    version: 1,
    ports: { daemon: 4040, canvas: 6060 },
    editor: { default: "vscode" },
    ai: {},
  });
  ensureJsonFile(resolve(root, "workspaces.json"), {
    version: 1,
    activeWorkspaceId: null,
    workspaces: {},
  });
  const logPath = resolve(logs, "daemon.log");
  if (!existsSync(logPath)) {
    writeFileSync(logPath, "");
  }
  return { root, workspaces, logs };
}

export function workspaceDirectory(user: UserDirectory, id: string): string {
  const directory = resolve(user.workspaces, id);
  mkdirSync(resolve(directory, "cache"), { recursive: true });
  return directory;
}

export function readJsonFile<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function ensureJsonFile(path: string, value: unknown): void {
  if (!existsSync(path)) {
    writeJsonAtomic(path, value);
  }
}
