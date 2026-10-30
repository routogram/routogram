import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const targetDir = path.join(rootDir, "crates", "routogram-desktop", "resources", "daemon");

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const cliDist = path.join(rootDir, "packages", "cli", "dist");
if (fs.existsSync(cliDist)) {
  fs.cpSync(cliDist, path.join(targetDir, "dist"), { recursive: true });
}

const coreDir = path.join(rootDir, "crates", "routogram-core");
if (fs.existsSync(coreDir)) {
  for (const file of fs.readdirSync(coreDir)) {
    if (file.endsWith(".node")) {
      fs.copyFileSync(path.join(coreDir, file), path.join(targetDir, file));
    }
  }
}

console.log("[desktop-daemon] Resources prepared at crates/routogram-desktop/resources/daemon");
