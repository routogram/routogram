import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import type { DirectoryEntry, PickDirectoryResult } from "@routogram/types";

const execFileAsync = promisify(execFile);
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "target",
  "coverage",
  ".turbo",
  ".vite",
  "routogram-report",
]);

export async function pickDirectory(): Promise<PickDirectoryResult> {
  if (process.env.ROUTOGRAM_HEADLESS === "1") {
    return { path: null, canceled: false, supported: false };
  }

  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync(
        "osascript",
        ["-e", 'POSIX path of (choose folder with prompt "Select Workspace Folder")'],
        { timeout: 120_000 },
      );
      return { path: normalizePickerPath(stdout), canceled: false, supported: true };
    }
    if (process.platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms;",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;",
        '$dialog.Description = "Select Workspace Folder";',
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
        "  Write-Output $dialog.SelectedPath",
        "}",
      ].join(" ");
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], {
        timeout: 120_000,
      });
      return { path: normalizePickerPath(stdout), canceled: false, supported: true };
    }
    if (process.platform === "linux") {
      for (const command of ["zenity", "kdialog"] as const) {
        try {
          const args =
            command === "zenity"
              ? ["--file-selection", "--directory", "--title=Select Workspace Folder"]
              : ["--getexistingdirectory", homedir(), "--title", "Select Workspace Folder"];
          const { stdout } = await execFileAsync(command, args, { timeout: 120_000 });
          return { path: normalizePickerPath(stdout), canceled: false, supported: true };
        } catch {
          // Try the next supported Linux dialog before falling back.
        }
      }
    }
  } catch (error) {
    if (isCancel(error)) {
      return { path: null, canceled: true, supported: true };
    }
  }

  return { path: null, canceled: false, supported: false };
}

export function listServerDirectories(pathInput: string): DirectoryEntry[] {
  const path = resolve(pathInput);
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    throw new Error(`Not a readable directory: ${pathInput}`);
  }

  return readdirSync(path, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith(".") && !IGNORED_DIRECTORIES.has(entry.name),
    )
    .map((entry) => {
      const childPath = resolve(path, entry.name);
      return {
        name: entry.name,
        path: childPath,
        isDirectory: true,
        hasPackageJson: existsSync(resolve(childPath, "package.json")),
        hasSrcDir:
          existsSync(resolve(childPath, "src")) &&
          Boolean(statSync(resolve(childPath, "src"), { throwIfNoEntry: false })?.isDirectory()),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function defaultBrowsePath(): string {
  return process.env.HOME ?? homedir();
}

function normalizePickerPath(value: string): string | null {
  const path = value.trim().replace(/\/$/, "");
  return path && existsSync(path) ? resolve(path) : null;
}

function isCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /cancel|user canceled|exit code 1/i.test(error.message);
}
