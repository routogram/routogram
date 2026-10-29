import { Hono } from "hono";

export type SimulationRunner = (
  root: string,
  topologyJson: string,
  operationsJson: string,
) => string;

type SimulationRoutesOptions = {
  root: string;
  getTopology: () => unknown;
  run: SimulationRunner;
  onResult: (result: unknown) => void;
};

export function createSimulationRoutes({
  root,
  getTopology,
  run,
  onResult,
}: SimulationRoutesOptions): Hono {
  const app = new Hono();

  const simulate = (operations: unknown): unknown => {
    const raw = run(root, JSON.stringify(getTopology()), JSON.stringify(operations));
    const result: unknown = JSON.parse(raw);
    onResult(result);
    return result;
  };

  app.post("/fork", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    try {
      return context.json(simulate(body.operations ?? []));
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/mutate", async (context) => {
    const body = await readBody(context.req.json.bind(context.req));
    if (!Array.isArray(body.operations)) {
      return context.json({ error: "operations must be an array." }, 400);
    }
    try {
      return context.json(simulate(body.operations));
    } catch (error) {
      return context.json({ error: message(error) }, 422);
    }
  });

  app.post("/reset", (context) => {
    try {
      return context.json(simulate([]));
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
