import type { LinterDetectionResult } from "@routogram/types";
import { Hono } from "hono";

import {
  autoRecommendPlugins,
  getPluginCatalog,
  installPlugin,
  uninstallPlugin,
} from "../plugins/plugin-manager.js";

type ActiveWorkspace = {
  id: string;
  projectRoot: string;
  scanPath?: string;
  framework?: string;
};

type LinterDetection = LinterDetectionResult & {
  detectedFrameworks: string[];
};

type PluginRoutesOptions = {
  getUserDir: () => string;
  getActiveWorkspace: () => ActiveWorkspace | null;
  triggerDiagnostics: () => void;
};

export function createPluginRoutes({
  getUserDir,
  getActiveWorkspace,
  triggerDiagnostics,
}: PluginRoutesOptions): Hono {
  const app = new Hono();

  app.get("/", async (context) => {
    const active = getActiveWorkspace();
    const plugins = await getPluginCatalog(getUserDir());
    const recommendation = active
      ? await autoRecommendPlugins(active.scanPath || active.projectRoot, active.framework)
      : { linters: [], plugins: [], frameworks: [] };
    const linters: LinterDetection = {
      workspaceId: active?.id ?? "",
      detectedLinters: recommendation.linters,
      recommendedPlugins: recommendation.plugins,
      detectedFrameworks: recommendation.frameworks,
    };
    return context.json({ plugins, linters });
  });

  app.post("/install", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    const pluginId =
      typeof body === "object" && body !== null && "pluginId" in body
        ? (body as { pluginId?: unknown }).pluginId
        : undefined;
    if (typeof pluginId !== "string" || !pluginId) {
      return context.json({ error: "pluginId is required." }, 400);
    }
    try {
      const plugin = await installPlugin(getUserDir(), pluginId);
      triggerDiagnostics();
      return context.json({ plugin }, 201);
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/uninstall", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    const pluginId =
      typeof body === "object" && body !== null && "pluginId" in body
        ? (body as { pluginId?: unknown }).pluginId
        : undefined;
    if (typeof pluginId !== "string" || !pluginId) {
      return context.json({ error: "pluginId is required." }, 400);
    }
    try {
      const plugin = await uninstallPlugin(getUserDir(), pluginId);
      triggerDiagnostics();
      return context.json({ item: plugin });
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/scan-diagnostics", (context) => {
    triggerDiagnostics();
    return context.json({ ok: true, accepted: true }, 202);
  });

  return app;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
