import type { RoutogramAiResponse } from "@routogram/types";
import type { AiSettings } from "@/lib/apis/models/ai.model";
import { type ApiEndpoint, apiUrl } from "@/lib/constants";

export async function requestAi<T>(
  endpoint: ApiEndpoint,
  settings: AiSettings,
  extra: Record<string, unknown>,
): Promise<RoutogramAiResponse<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-routogram-ai-provider": settings.provider,
  };

  if (settings.apiKey.trim()) {
    headers["x-routogram-api-key"] = settings.apiKey.trim();
  }
  if (settings.model.trim()) {
    headers["x-routogram-ai-model"] = settings.model.trim();
  }
  if (settings.baseUrl.trim()) {
    headers["x-routogram-ai-base-url"] = settings.baseUrl.trim();
  }

  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...extra,
      provider: settings.provider,
      model: settings.model.trim() || undefined,
      baseUrl: settings.baseUrl.trim() || undefined,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload) ?? `Copilot request failed with HTTP ${response.status}.`,
    );
  }

  if (!isRecord(payload) || !("result" in payload)) {
    throw new Error("The daemon returned an invalid Copilot response.");
  }

  return payload as unknown as RoutogramAiResponse<T>;
}

function errorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.error !== "string") {
    return null;
  }

  return payload.error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
