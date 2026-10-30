import { spawn } from "node:child_process";

const services = [
  {
    name: "daemon",
    url: "http://127.0.0.1:4040/api/health",
    args: ["--filter", "routogram", "dev"],
  },
  {
    name: "canvas",
    url: "http://127.0.0.1:6060/",
    args: ["--filter", "@routogram/canvas", "dev"],
  },
];

const children = [];
let shuttingDown = false;

async function isRunning(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(600) });
    return true;
  } catch {
    return false;
  }
}

async function waitForService(url, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isRunning(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function stopChildren(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
}

for (const service of services) {
  if (await isRunning(service.url)) {
    console.log(`[dev] ${service.name} already running; reusing it.`);
    continue;
  }

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(command, service.args, { stdio: "inherit", env: process.env });
  children.push(child);
  if (service.name === "daemon") {
    await waitForService(service.url);
  }
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${service.name} exited with code ${code ?? 1}.`);
      stopChildren(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopChildren(0));
process.on("SIGTERM", () => stopChildren(0));

if (children.length === 0) {
  console.log("[dev] Routogram daemon and canvas are already running.");
  process.exit(0);
}
