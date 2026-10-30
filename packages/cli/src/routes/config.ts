import type { AiConfig } from "@routogram/types";
import { Hono } from "hono";

type ConfigRouteOptions = {
  getRaw: () => Record<string, unknown>;
  getAi: () => AiConfig | undefined;
  getConfigPath: () => string | null;
};

const SECRET_KEY = /(api[-_]?key|secret|password|access[-_]?token|auth[-_]?token)/i;

export function sanitizeConfigSecrets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeConfigSecrets(entry, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeConfigSecrets(entryValue, entryKey),
      ]),
    );
  }

  if (typeof value === "string" && SECRET_KEY.test(key)) {
    return maskSecret(value);
  }

  return value;
}

function maskSecret(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

export function createConfigRoutes({ getRaw, getAi, getConfigPath }: ConfigRouteOptions): Hono {
  const app = new Hono();

  app.get("/ai", (context) => {
    const ai = getAi();
    return context.json({
      default: ai?.default ?? null,
      providers: (ai?.providers ?? []).map((provider) => ({
        id: provider.id,
        name: provider.name,
        provider: provider.provider,
        model: provider.model,
        baseUrl: provider.baseUrl ?? null,
        defaultEffort: provider.defaultEffort ?? null,
        hasApiKey: Boolean(provider.apiKey),
      })),
      configPath: getConfigPath(),
    });
  });

  app.get("/", (context) =>
    context.json({
      config: sanitizeConfigSecrets(getRaw()),
      configPath: getConfigPath(),
    }),
  );

  return app;
}
