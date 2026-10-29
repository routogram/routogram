import { Hono } from "hono";

export type RefactorRunner = (
  root: string,
  recipeId: string,
  targetNodeId: string,
  previewOnly: boolean,
) => string;

type RefactorRoutesOptions = {
  root: string;
  run: RefactorRunner;
  onApplied: () => void;
};

export function createRefactorRoutes({ root, run, onApplied }: RefactorRoutesOptions): Hono {
  const app = new Hono();

  app.post("/apply", async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      return context.json({ error: "A JSON request body is required." }, 400);
    }

    if (typeof payload !== "object" || payload === null) {
      return context.json({ error: "A JSON request body is required." }, 400);
    }

    const body = payload as Record<string, unknown>;
    const recipeId = body.recipeId;
    const targetNodeId = body.targetNodeId;
    const previewOnly = body.previewOnly === true;

    if (typeof recipeId !== "string" || recipeId.length === 0) {
      return context.json({ error: "recipeId must be a non-empty string." }, 400);
    }
    if (typeof targetNodeId !== "string" || targetNodeId.length === 0) {
      return context.json({ error: "targetNodeId must be a non-empty string." }, 400);
    }

    try {
      const raw = run(root, recipeId, targetNodeId, previewOnly);
      const result: unknown = JSON.parse(raw);

      if (
        typeof result !== "object" ||
        result === null ||
        !("diff" in result) ||
        !("files" in result)
      ) {
        return context.json({ error: "The native refactor result was invalid." }, 502);
      }

      if (!previewOnly && (result as { applied?: boolean }).applied) {
        onApplied();
      }

      return context.json({ ...result, previewOnly });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
    }
  });

  return app;
}
