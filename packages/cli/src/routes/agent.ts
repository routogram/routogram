import { Hono } from "hono";

import type { AgentMission, AgentMissionManager } from "../agent/mod.js";

type AgentRoutesOptions = {
  manager: AgentMissionManager;
};

export function createAgentRoutes({ manager }: AgentRoutesOptions): Hono {
  const app = new Hono();

  app.get("/missions", (context) => context.json({ missions: manager.list() }));

  app.get("/missions/:id", (context) => {
    const mission = manager.get(context.req.param("id"));
    return mission ? context.json(mission) : context.json({ error: "Mission not found." }, 404);
  });

  app.post("/missions", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: "A JSON body is required." }, 400);
    }
    const payload =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const goal = typeof payload.goal === "string" ? payload.goal.trim() : "";
    if (!goal) {
      return context.json({ error: "goal is required." }, 400);
    }
    const mission = manager.start(
      goal,
      typeof payload.targetNodeId === "string" ? payload.targetNodeId : undefined,
    );
    return context.json(mission, 201);
  });

  app.post("/missions/:id/approve", async (context) => {
    const mission = await manager.approve(context.req.param("id"));
    return mission ? context.json(mission) : context.json({ error: "Mission not found." }, 404);
  });

  app.post("/missions/:id/reject", (context) => {
    const mission = manager.reject(context.req.param("id"));
    return mission ? context.json(mission) : context.json({ error: "Mission not found." }, 404);
  });

  return app;
}

export type { AgentMission };
