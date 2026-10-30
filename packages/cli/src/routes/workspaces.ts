import { Hono } from "hono";

import {
  defaultBrowsePath,
  listServerDirectories,
  pickDirectory,
} from "../system/directory-picker.js";
import type { WorkspaceManager, WorkspaceScanResult } from "../workspace-manager.js";

type WorkspaceRoutesOptions = {
  manager: WorkspaceManager;
  onActivated: (result: WorkspaceScanResult) => void;
  onChanged: () => void;
};

export function createWorkspaceRoutes({
  manager,
  onActivated,
  onChanged,
}: WorkspaceRoutesOptions): Hono {
  const app = new Hono();

  app.onError((error, context) => context.json({ error: message(error) }, 500));

  app.get("/", (context) => context.json(manager.getRegistry()));

  app.post("/pick-directory", async (context) => {
    try {
      return context.json(await pickDirectory());
    } catch (error) {
      return context.json({ error: message(error) || "Failed to open folder picker." }, 500);
    }
  });

  app.get("/fs-list", (context) => {
    const path = context.req.query("path") ?? defaultBrowsePath();
    try {
      return context.json({ path, entries: listServerDirectories(path) });
    } catch (error) {
      return context.json({ error: message(error) || "Directory listing failed." }, 500);
    }
  });

  app.post("/inspect-path", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    if (typeof body.path !== "string" || !body.path.trim()) {
      return context.json({ error: "path is required." }, 400);
    }
    try {
      return context.json(manager.inspect(body.path));
    } catch (error) {
      return context.json({ error: message(error) || "Path inspection failed." }, 500);
    }
  });

  app.post("/", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    if (typeof body.path !== "string" || !body.path.trim()) {
      return context.json({ error: "path is required." }, 400);
    }
    try {
      const result = await manager.add(body.path, {
        ...(typeof body.scanPath === "string" ? { scanPath: body.scanPath } : {}),
      });
      onActivated(result);
      return context.json({ workspace: result.summary, cached: result.cached }, 201);
    } catch (error) {
      return context.json({ error: message(error) }, 500);
    }
  });

  app.post("/:id/activate", async (context) => {
    try {
      const result = await manager.activate(context.req.param("id"));
      onActivated(result);
      return context.json({ workspace: result.summary, cached: result.cached });
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/:id/rescan", async (context) => {
    try {
      const result = await manager.rescan(context.req.param("id"));
      onActivated(result);
      return context.json({ workspace: result.summary });
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.delete("/:id", (context) => {
    manager.remove(context.req.param("id"));
    onChanged();
    return context.json({ ok: true });
  });

  return app;
}

async function readBody(reader: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await reader();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
