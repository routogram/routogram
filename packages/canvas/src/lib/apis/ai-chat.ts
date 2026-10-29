import { API, apiUrl } from "@/lib/constants";

export type AiChatProvider = "deepseek" | "openai" | "anthropic" | "custom";

export type AiProviderOption = {
  id: string;
  name: string;
  provider: AiChatProvider;
  model: string;
  baseUrl: string | null;
  defaultEffort: "Low" | "Medium" | "High" | null;
  hasApiKey: boolean;
};

export type AiProvidersResponse = {
  default: string | null;
  providers: AiProviderOption[];
  configPath: string | null;
};

export type AiChatRequest = {
  message: string;
  providerId: string;
  effort: "Low" | "Medium" | "High";
};

export type AiChatResponse = {
  result: { answer: string };
  providerId: string;
  providerName: string;
  provider: AiChatProvider;
  model: string;
  effort: "Low" | "Medium" | "High";
};

export async function fetchAiProviders(): Promise<AiProvidersResponse> {
  const response = await fetch(apiUrl(API.aiProviders), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`AI provider configuration unavailable (HTTP ${response.status}).`);
  }
  return (await response.json()) as AiProvidersResponse;
}

export async function askArchitectureAi(input: AiChatRequest): Promise<AiChatResponse> {
  const response = await fetch(apiUrl(API.aiChat), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | AiChatResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(error || `AI chat failed with HTTP ${response.status}.`);
  }
  if (!payload || !("result" in payload) || typeof payload.result?.answer !== "string") {
    throw new Error("The daemon returned an invalid AI response.");
  }

  return payload as AiChatResponse;
}
