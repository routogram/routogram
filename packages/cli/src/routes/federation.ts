import { Hono } from "hono";

type FederationRoutesOptions = {
  roots: string[];
  run: (roots: string[]) => string;
};

export function createFederationRoutes({ roots, run }: FederationRoutesOptions): Hono {
  const app = new Hono();

  app.get("/", (context) => {
    try {
      return context.json(JSON.parse(run(roots)));
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 422);
    }
  });

  app.get("/roots", (context) => context.json({ roots }));
  return app;
}
