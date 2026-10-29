import { Hono } from "hono";

type MigrationRoutesOptions = {
  root: string;
  run: (root: string, recipeId: string, apply: boolean) => string;
  onApplied: () => void;
  onPreview: (result: unknown) => void;
};

export function createMigrationRoutes({
  root,
  run,
  onApplied,
  onPreview,
}: MigrationRoutesOptions): Hono {
  const app = new Hono();

  app.post("/scan", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    const recipeId = body.recipeId;
    if (typeof recipeId !== "string" || !recipeId) {
      return context.json({ error: "recipeId is required." }, 400);
    }
    try {
      const result: unknown = JSON.parse(run(root, recipeId, false));
      onPreview(result);
      return context.json(result);
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/apply", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    const recipeId = body.recipeId;
    if (typeof recipeId !== "string" || !recipeId) {
      return context.json({ error: "recipeId is required." }, 400);
    }
    try {
      const result: unknown = JSON.parse(run(root, recipeId, true));
      onApplied();
      return context.json(result);
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
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
