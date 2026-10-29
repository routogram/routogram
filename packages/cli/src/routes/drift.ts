import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { Hono } from "hono";

const execFileAsync = promisify(execFile);

type DriftRoutesOptions = {
  root: string;
};

export function createDriftRoutes({ root }: DriftRoutesOptions): Hono {
  const app = new Hono();

  app.post("/heal", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: "A JSON body is required." }, 400);
    }
    if (typeof body !== "object" || body === null) {
      return context.json({ error: "A JSON body is required." }, 400);
    }
    const payload = body as { action?: unknown; files?: unknown };
    if (payload.action !== "revert" || !Array.isArray(payload.files)) {
      return context.json(
        { error: "Only the explicit revert action with a files array is supported." },
        400,
      );
    }
    const files = payload.files
      .filter((file): file is string => typeof file === "string" && file.length > 0)
      .map((file) => resolve(root, file))
      .filter((file) => {
        const path = relative(root, file);
        return !path.startsWith("..") && !isAbsolute(path);
      });

    if (files.length === 0) {
      return context.json({ error: "No valid workspace files were provided." }, 400);
    }

    try {
      await execFileAsync("git", ["checkout", "--", ...files], { cwd: root });
      return context.json({ ok: true, files: files.map((file) => relative(root, file)) });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
    }
  });

  app.post("/acknowledge", (context) => context.json({ ok: true }));

  return app;
}
