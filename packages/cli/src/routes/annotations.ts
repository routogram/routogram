import { Hono } from "hono";

import {
  type AnnotationKind,
  createAnnotation,
  deleteAnnotation,
  loadAnnotations,
  updateAnnotation,
} from "../annotations.js";

type AnnotationRoutesOptions = {
  root: string;
};

const KINDS = new Set<AnnotationKind>(["pin", "adr", "boundary"]);

export function createAnnotationRoutes({ root }: AnnotationRoutesOptions): Hono {
  const app = new Hono();

  app.get("/", (context) => {
    try {
      return context.json(loadAnnotations(root));
    } catch (error) {
      return context.json({ error: message(error) }, 500);
    }
  });

  app.post("/", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!title) {
      return context.json({ error: "title is required." }, 400);
    }
    if (!Array.isArray(body.nodeIds) || !body.nodeIds.every((id) => typeof id === "string")) {
      return context.json({ error: "nodeIds must be an array of strings." }, 400);
    }
    if (body.kind !== undefined && !KINDS.has(body.kind as AnnotationKind)) {
      return context.json({ error: "kind must be pin, adr, or boundary." }, 400);
    }

    try {
      const annotation = createAnnotation(root, {
        nodeIds: body.nodeIds,
        kind: body.kind as AnnotationKind | undefined,
        title,
        body: typeof body.body === "string" ? body.body : "",
        author: typeof body.author === "string" ? body.author : undefined,
        color: typeof body.color === "string" ? body.color : undefined,
        adrUrl: typeof body.adrUrl === "string" ? body.adrUrl : undefined,
        region: isRegion(body.region) ? body.region : undefined,
      });
      return context.json(annotation, 201);
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.patch("/:id", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    try {
      const annotation = updateAnnotation(root, context.req.param("id"), {
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        ...(typeof body.body === "string" ? { body: body.body } : {}),
        ...(body.kind !== undefined && KINDS.has(body.kind as AnnotationKind)
          ? { kind: body.kind as AnnotationKind }
          : {}),
        ...(typeof body.adrUrl === "string" ? { adrUrl: body.adrUrl } : {}),
        ...(typeof body.color === "string" ? { color: body.color } : {}),
      });
      return context.json(annotation);
    } catch (error) {
      return context.json({ error: message(error) }, 404);
    }
  });

  app.delete("/:id", (context) => {
    try {
      deleteAnnotation(root, context.req.param("id"));
      return context.json({ ok: true });
    } catch (error) {
      return context.json({ error: message(error) }, 404);
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

function isRegion(
  value: unknown,
): value is { x: number; y: number; width: number; height: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    ["x", "y", "width", "height"].every(
      (key) => typeof (value as Record<string, unknown>)[key] === "number",
    )
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
