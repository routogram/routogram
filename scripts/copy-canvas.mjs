import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const source = resolve(repositoryRoot, "packages/canvas/dist");
const target = resolve(repositoryRoot, "packages/cli/assets");

if (!existsSync(resolve(source, "index.html"))) {
  console.error("Canvas build is missing. Run the canvas build before bundling.");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`bundled canvas into ${target}`);
