import type { RoutogramAiProvider } from "@routogram/types";

export type AiSettings = {
  provider: RoutogramAiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  remember: boolean;
};

export type AiResponseMeta = {
  provider: string;
  model: string;
};
