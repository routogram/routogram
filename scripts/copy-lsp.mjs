import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extension = process.platform === "win32" ? ".exe" : "";
const source = resolve(root, "target", "release", `routogram-lsp${extension}`);
const destination = resolve(root, "packages/cli/assets/bin", `routogram-lsp${extension}`);

if (!existsSync(source)) {
  console.warn(
    `[lsp] binary not found at ${source}; run cargo build --release --bin routogram-lsp`,
  );
  process.exit(0);
}

mkdirSync(resolve(destination, ".."), { recursive: true });
copyFileSync(source, destination);
if (process.platform !== "win32") {
  chmodSync(destination, 0o755);
}
console.log(`[lsp] bundled ${destination}`);
