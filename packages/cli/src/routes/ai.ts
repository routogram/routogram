import {
  type AiConfig,
  type AiProviderConfig,
  ROUTOGRAM_AI_PROVIDERS,
  type RoutogramAiAuditResult,
  type RoutogramAiFinding,
  type RoutogramAiProvider,
  type RoutogramAiQueryResult,
  type RoutogramTopology,
} from "@routogram/types";
import { type Context, Hono } from "hono";

type JsonRecord = Record<string, unknown>;

type ProviderName = RoutogramAiProvider | "custom";

interface ProviderConfig {
  provider: ProviderName;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

class AiRequestError extends Error {
  constructor(
    readonly status: 400 | 502,
    message: string,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

const PROVIDER_DEFAULTS: Record<RoutogramAiProvider, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-latest",
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
  },
};

const ENV_KEYS: Partial<Record<RoutogramAiProvider, string>> = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const AUDIT_SYSTEM_PROMPT = `You are a Senior Frontend and Fullstack Software Architect analyzing a Routogram topology graph.

The topology is the single source of truth. Do not invent nodes, files, routes, components, or edges that are not present in the JSON.

Inspect for:
- Prop drilling across too many component layers.
- Server/Client component asymmetry and layout-shift risks.
- Redundant API calls, missing route guards, client/server boundary leaks.
- Boundary coupling around calls_api and invokes_action edges.
- CSS style blast radius, dead CSS, and token coupling risks.

Return ONLY a single JSON object with this exact shape:
{
  "summary": "short architecture assessment",
  "score": 0,
  "findings": [
    {
      "id": "stable-kebab-case-id",
      "severity": "critical" | "warning" | "info",
      "category": "prop-drilling" | "server-client" | "api-boundary" | "route-guard" | "styles" | "architecture",
      "title": "short title",
      "description": "evidence from the topology",
      "nodeIds": ["existing-node-id"],
      "recommendation": "specific refactor action"
    }
  ]
}

Score is an integer from 0 (critical architecture debt) to 100 (healthy). Every nodeIds entry MUST be an exact node id from the topology. Do not return markdown or prose outside the JSON object.`;

const QUERY_SYSTEM_PROMPT = `You are a Senior Frontend and Fullstack Software Architect answering questions about a Routogram topology graph.

The topology is the single source of truth. Only reference node ids that exist in the JSON.

Return ONLY a single JSON object with this exact shape:
{
  "answer": "direct answer grounded in the topology",
  "nodeIds": ["existing-node-id"],
  "confidence": 0.0
}

nodeIds must identify every node relevant to the answer and MUST be exact ids from the topology. confidence is a number from 0 to 1. Do not return markdown or prose outside the JSON object.`;

type AiRouteOptions = {
  getAi?: () => AiConfig | undefined;
};

const CHAT_SYSTEM_PROMPT = `You are Architecture Assistant, a concise senior frontend and fullstack architect embedded in Routogram.

The supplied topology JSON is the only source of truth. Reference only nodes, files, routes, and edges that exist in it. Answer the user's question directly, using short Markdown and fenced code blocks when useful. If the topology does not contain enough evidence, say so instead of inventing details. Do not output JSON.`;

type EffortLevel = "Low" | "Medium" | "High";

const EFFORT_INSTRUCTIONS: Record<EffortLevel, string> = {
  Low: "Keep the answer concise and direct.",
  Medium: "Balance brevity with enough architecture detail to be actionable.",
  High: "Reason deeply about AST structure, boundaries, routes, and cross-package impact. Include the most important supporting evidence.",
};

function normalizeEffort(value: unknown): EffortLevel {
  return value === "Medium" || value === "High" ? value : "Low";
}

export function createAiRoutes(
  getTopology: () => RoutogramTopology,
  options: AiRouteOptions = {},
): Hono {
  const app = new Hono();

  app.post("/audit", async (context) => {
    try {
      const body = await readBody(context.req.raw);
      const providerConfig = resolveProviderConfig(context.req.raw, body);
      const topology = getTopology();
      const content = await requestCompletion(
        providerConfig,
        AUDIT_SYSTEM_PROMPT,
        `Audit this topology JSON:\n${JSON.stringify(topology)}`,
      );

      const result = normalizeAudit(parseJsonObject(content), topology);

      return context.json({
        result,
        provider: providerConfig.provider,
        model: providerConfig.model,
      });
    } catch (error) {
      return aiError(context, error);
    }
  });

  app.post("/query", async (context) => {
    try {
      const body = await readBody(context.req.raw);
      const question = typeof body.question === "string" ? body.question.trim() : "";

      if (question.length === 0) {
        throw new AiRequestError(400, "A non-empty question is required.");
      }

      const providerConfig = resolveProviderConfig(context.req.raw, body);
      const topology = getTopology();
      const content = await requestCompletion(
        providerConfig,
        QUERY_SYSTEM_PROMPT,
        `Question: ${question}\n\nTopology JSON:\n${JSON.stringify(topology)}`,
      );

      const result = normalizeQuery(parseJsonObject(content), topology);

      return context.json({
        result,
        provider: providerConfig.provider,
        model: providerConfig.model,
      });
    } catch (error) {
      return aiError(context, error);
    }
  });

  app.post("/chat", async (context) => {
    try {
      const body = await readBody(context.req.raw);
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (message.length === 0) {
        throw new AiRequestError(400, "A non-empty message is required.");
      }

      const provider = resolveConfiguredProvider(body.providerId, options.getAi?.());
      if (!provider) {
        throw new AiRequestError(
          400,
          "No AI providers are configured. Add an ai.providers array to .routogramrc.json.",
        );
      }
      const providerConfig = resolveConfiguredProviderConfig(provider, context.req.raw);
      const effort = normalizeEffort(body.effort ?? provider.defaultEffort);
      const topology = getTopology();
      const answer = await requestCompletion(
        providerConfig,
        `${CHAT_SYSTEM_PROMPT}\n\nReasoning effort: ${effort}. ${EFFORT_INSTRUCTIONS[effort]}`,
        `Question: ${message}\n\nTopology JSON:\n${JSON.stringify(topology)}`,
      );

      return context.json({
        result: { answer },
        providerId: provider.id,
        providerName: provider.name,
        provider: providerConfig.provider,
        model: providerConfig.model,
        effort,
      });
    } catch (error) {
      return aiError(context, error);
    }
  });

  return app;
}

async function readBody(request: Request): Promise<JsonRecord> {
  const parsed: unknown = await request.json().catch(() => ({}));

  return isRecord(parsed) ? parsed : {};
}

function resolveConfiguredProvider(rawProviderId: unknown, ai?: AiConfig): AiProviderConfig | null {
  const providers = ai?.providers ?? [];
  if (providers.length === 0) {
    return null;
  }

  const requested = typeof rawProviderId === "string" ? rawProviderId.trim() : "";
  if (requested) {
    return providers.find((provider) => provider.id === requested) ?? null;
  }

  return providers.find((provider) => provider.id === ai?.default) ?? providers[0] ?? null;
}

function resolveConfiguredProviderConfig(
  provider: AiProviderConfig,
  request: Request,
): ProviderConfig {
  const defaults = PROVIDER_DEFAULTS[provider.provider as RoutogramAiProvider];
  const baseUrl = (provider.baseUrl ?? defaults?.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey =
    resolveEnvTemplate(provider.apiKey) ?? resolveApiKey(provider.provider, request, {});

  if (!baseUrl) {
    throw new AiRequestError(400, `Provider ${provider.id} needs a baseUrl.`);
  }
  if (provider.provider !== "custom" && !apiKey) {
    throw new AiRequestError(
      400,
      `Provider ${provider.id} is missing an API key. Set the referenced environment variable.`,
    );
  }

  return {
    provider: provider.provider,
    baseUrl,
    model: provider.model,
    apiKey,
    temperature: 0.1,
  };
}

function resolveEnvTemplate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const resolved = value
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "")
    .trim();
  return resolved.length > 0 ? resolved : undefined;
}

function resolveProviderConfig(request: Request, body: JsonRecord): ProviderConfig {
  const provider = resolveProvider(body.provider, request);

  if (!provider) {
    throw new AiRequestError(
      400,
      "No AI provider configured. Select a provider in the chat menu or set the matching API key environment variable.",
    );
  }

  const defaults = PROVIDER_DEFAULTS[provider as RoutogramAiProvider];
  const apiKey = resolveApiKey(provider, request, body);
  const model =
    firstString(body.model, request.headers.get("x-routogram-ai-model")) ?? defaults?.model;
  const rawBaseUrl =
    firstString(body.baseUrl, request.headers.get("x-routogram-ai-base-url")) ??
    defaults?.baseUrl ??
    "";

  if (!model) {
    throw new AiRequestError(400, "A model id is required.");
  }

  let baseUrl = rawBaseUrl.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new AiRequestError(400, "A base URL is required for this provider.");
  }
  if (provider === "ollama" && /^https?:\/\/[^/]+$/i.test(baseUrl)) {
    baseUrl = `${baseUrl}/v1`;
  }
  if (provider !== "ollama" && provider !== "custom" && !apiKey) {
    const envName = ENV_KEYS[provider];
    throw new AiRequestError(
      400,
      `Missing API key for ${provider}. Add it in the chat model menu or set ${envName ?? "the provider API key"}.`,
    );
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.1,
  };
}

function resolveProvider(rawProvider: unknown, request: Request): ProviderName | null {
  const requested =
    typeof rawProvider === "string"
      ? rawProvider.toLowerCase()
      : request.headers.get("x-routogram-ai-provider")?.toLowerCase();

  if (requested === "custom") {
    return "custom";
  }
  if (isProvider(requested)) {
    return requested;
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return "deepseek";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.OLLAMA_BASE_URL) {
    return "ollama";
  }

  return null;
}

function resolveApiKey(
  provider: ProviderName,
  request: Request,
  body: JsonRecord,
): string | undefined {
  if (provider === "ollama") {
    return undefined;
  }

  const bodyKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (bodyKey) {
    return bodyKey;
  }

  const headerKey = request.headers.get("x-routogram-api-key")?.trim();
  if (headerKey) {
    return headerKey;
  }

  const envName = provider === "custom" ? null : ENV_KEYS[provider];
  return envName ? process.env[envName] : undefined;
}

async function requestCompletion(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  return config.provider === "anthropic"
    ? requestAnthropic(config, messages)
    : requestOpenAiCompatible(config, messages);
}

async function requestOpenAiCompatible(
  config: ProviderConfig,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.1,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new AiRequestError(
      502,
      `${config.provider} returned HTTP ${response.status}: ${truncate(await response.text(), 600)}`,
    );
  }

  const payload: unknown = await response.json();
  const content = isRecord(payload) ? readOpenAiContent(payload.choices) : null;

  if (!content) {
    throw new AiRequestError(502, `${config.provider} returned an empty completion.`);
  }

  return content;
}

function readOpenAiContent(choices: unknown): string | null {
  if (!Array.isArray(choices)) {
    return null;
  }

  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }

  return typeof first.message.content === "string" ? first.message.content : null;
}

async function requestAnthropic(config: ProviderConfig, messages: ChatMessage[]): Promise<string> {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": config.apiKey ?? "",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2_048,
      temperature: config.temperature ?? 0.1,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new AiRequestError(
      502,
      `anthropic returned HTTP ${response.status}: ${truncate(await response.text(), 600)}`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    throw new AiRequestError(502, "anthropic returned an empty completion.");
  }

  const content = payload.content
    .filter(
      (block): block is JsonRecord & { type: "text"; text: string } =>
        isRecord(block) && block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!content) {
    throw new AiRequestError(502, "anthropic returned an empty completion.");
  }

  return content;
}

function parseJsonObject(content: string): JsonRecord {
  const withoutFences = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new AiRequestError(502, "The AI response did not contain a JSON object.");
  }

  const parsed: unknown = JSON.parse(withoutFences.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new AiRequestError(502, "The AI response JSON was not an object.");
  }

  return parsed;
}

function normalizeAudit(value: JsonRecord, topology: RoutogramTopology): RoutogramAiAuditResult {
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const findings = Array.isArray(value.findings)
    ? value.findings.slice(0, 30).map((finding, index) => normalizeFinding(finding, index, nodeIds))
    : [];

  return {
    summary: firstString(value.summary) ?? "No architecture summary returned.",
    score: clampNumber(value.score, 0, 100, 0),
    findings,
  };
}

function normalizeFinding(value: unknown, index: number, nodeIds: Set<string>): RoutogramAiFinding {
  const finding = isRecord(value) ? value : {};
  const severity =
    finding.severity === "critical" || finding.severity === "warning" ? finding.severity : "info";
  const rawNodeIds = Array.isArray(finding.nodeIds) ? finding.nodeIds : [];

  return {
    id: firstString(finding.id) ?? `finding-${index + 1}`,
    severity,
    category: firstString(finding.category) ?? "architecture",
    title: firstString(finding.title) ?? "Architecture finding",
    description: firstString(finding.description) ?? "",
    nodeIds: rawNodeIds.filter(
      (nodeId): nodeId is string => typeof nodeId === "string" && nodeIds.has(nodeId),
    ),
    recommendation: firstString(finding.recommendation) ?? "",
  };
}

function normalizeQuery(value: JsonRecord, topology: RoutogramTopology): RoutogramAiQueryResult {
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const rawNodeIds = Array.isArray(value.nodeIds) ? value.nodeIds : [];

  return {
    answer: firstString(value.answer) ?? "No answer returned.",
    nodeIds: rawNodeIds.filter(
      (nodeId): nodeId is string => typeof nodeId === "string" && nodeIds.has(nodeId),
    ),
    confidence: clampNumber(value.confidence, 0, 1, 0.5),
  };
}

function aiError(context: Context, error: unknown) {
  if (error instanceof AiRequestError) {
    return context.json({ error: error.message }, error.status);
  }
  return context.json({ error: error instanceof Error ? error.message : String(error) }, 502);
}

function isProvider(value: unknown): value is RoutogramAiProvider {
  return typeof value === "string" && (ROUTOGRAM_AI_PROVIDERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}
