import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const cleanTargets = [
  "node_modules",
  "crates/routogram-core/node_modules",
  "target",
  ".turbo",
  "packages/types/dist",
  "packages/cli/dist",
  "packages/client/dist",
  "packages/cloud-sync/dist",
  "packages/canvas/dist",
  "packages/vscode-extension/dist",
  "packages/cli/assets",
];

for (const packageEntry of readdirSync(resolve(repositoryRoot, "packages"))) {
  cleanTargets.push(`packages/${packageEntry}/node_modules`);
}

for (const target of cleanTargets) {
  const absolutePath = resolve(repositoryRoot, target);

  if (existsSync(absolutePath)) {
    rmSync(absolutePath, { recursive: true, force: true });
    console.log(`removed ${target}`);
  }
}

// Native addons are platform-specific build outputs, so they are never committed.
// Native addon là sản phẩm build theo nền tảng nên không bao giờ được commit.
const coreDirectory = resolve(repositoryRoot, "crates/routogram-core");

if (existsSync(coreDirectory)) {
  for (const entry of readdirSync(coreDirectory)) {
    if (entry.endsWith(".node")) {
      rmSync(resolve(coreDirectory, entry), { force: true });
      console.log(`removed crates/routogram-core/${entry}`);
    }
  }
}

console.log("clean complete");

// Cargo artifacts are cleaned separately so Rust and Node caches stay independent.
// Artifact Cargo được dọn riêng để cache Rust và Node độc lập.
const cargo = spawnSync("cargo", ["clean"], { cwd: repositoryRoot, stdio: "inherit" });
if (cargo.status !== 0) {
  console.warn("cargo clean skipped or failed");
}
