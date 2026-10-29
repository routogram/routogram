import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Hono } from "hono";

type GraphRoutesOptions = {
  root: string;
  build: (root: string) => string;
  search: (index: string, query: string, limit: number, filters: string) => string;
  query: (index: string, aql: string, limit: number) => string;
  context: (index: string, nodeIds: string) => string;
};

type SearchBody = {
  query?: unknown;
  mode?: unknown;
  limit?: unknown;
  filters?: unknown;
  nodeIds?: unknown;
  write?: unknown;
};

export function createGraphRoutes({
  root,
  build,
  search,
  query,
  context: contextForNode,
}: GraphRoutesOptions): Hono {
  const app = new Hono();
  let cache: { key: string; index: string; builtAt: number } | null = null;

  const getIndex = (force = false): string => {
    const key = `${root}:${force}`;
    if (!force && cache && cache.key === key && Date.now() - cache.builtAt < 8_000) {
      return cache.index;
    }

    const index = build(root);
    cache = { key, index, builtAt: Date.now() };
    return index;
  };

  app.get("/stats", (context) => {
    const index: unknown = JSON.parse(getIndex());
    if (!isRecord(index)) {
      return context.json({ error: "The native graph index was invalid." }, 502);
    }

    return context.json({
      dimensions: index.dimensions,
      embeddingModel: index.embeddingModel,
      stats: index.stats,
    });
  });

  app.post("/index", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    const index = getIndex(true);
    const parsed: unknown = JSON.parse(index);
    let file: string | null = null;

    if (body.write === true) {
      const directory = resolve(root, ".routogram");
      mkdirSync(directory, { recursive: true });
      file = resolve(directory, "graph-rag.json");
      writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
    }

    return context.json({
      ...(isRecord(parsed) ? parsed : {}),
      file,
      includeIndex: body.write === true,
    });
  });

  app.post("/search", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    const queryValue = typeof body.query === "string" ? body.query.trim() : "";

    if (!queryValue) {
      return context.json({ error: "A graph query is required." }, 400);
    }

    const limit = positiveInteger(body.limit) ?? 12;
    try {
      const index = getIndex();
      const raw =
        body.mode === "aql"
          ? query(index, queryValue, limit)
          : search(index, queryValue, limit, JSON.stringify(body.filters ?? {}));
      return context.json(JSON.parse(raw));
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
    }
  });

  app.post("/context", async (c) => {
    const body = await readBody(c.req.json.bind(c.req));

    if (!Array.isArray(body.nodeIds) || body.nodeIds.some((id) => typeof id !== "string")) {
      return c.json({ error: "nodeIds must be an array of strings." }, 400);
    }

    try {
      return c.json(JSON.parse(contextForNode(getIndex(), JSON.stringify(body.nodeIds))));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 422);
    }
  });

  return app;
}

async function readBody(reader: () => Promise<unknown>): Promise<SearchBody> {
  try {
    const body: unknown = await reader();
    return typeof body === "object" && body !== null ? (body as SearchBody) : {};
  } catch {
    return {};
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
